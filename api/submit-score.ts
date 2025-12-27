import { Redis } from "@upstash/redis";
import { IncomingMessage, ServerResponse } from "http";

// Initialize Redis - reads from environment variables automatically
// Upstash provides KV_REST_API_URL and KV_REST_API_TOKEN
function getRedisClient() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("Redis environment variables not set");
  }

  return new Redis({
    url,
    token,
  });
}

interface SubmitScoreRequest {
  username: string;
  score: number;
}

// Helper function to read request body
function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

// Helper function to set CORS headers
function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  setCorsHeaders(res);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    // Initialize Redis client
    let redis;
    try {
      redis = getRedisClient();
    } catch (initError) {
      console.error("Failed to initialize Redis:", initError);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Redis configuration error",
          details:
            initError instanceof Error ? initError.message : String(initError),
          success: false,
        })
      );
      return;
    }

    const body: SubmitScoreRequest = await readBody(req);

    // Validate input
    if (!body.username || typeof body.username !== "string") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ error: "Username is required and must be a string" })
      );
      return;
    }

    if (
      typeof body.score !== "number" ||
      body.score < 0 ||
      !Number.isInteger(body.score)
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Score must be a non-negative integer",
        })
      );
      return;
    }

    // Sanitize username (limit length, remove special characters)
    const username = body.username
      .trim()
      .slice(0, 50)
      .replace(/[^a-zA-Z0-9_-]/g, "");

    if (username.length === 0) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid username format" }));
      return;
    }

    // Check if user already exists
    const redisAny = redis as any;
    let existingScore: number | null = null;
    if (typeof redisAny.zscore === "function") {
      existingScore = await redisAny.zscore("leaderboard", username);
    } else if (typeof redisAny.zScore === "function") {
      existingScore = await redisAny.zScore("leaderboard", username);
    } else {
      const result = await redisAny.sendCommand([
        "ZSCORE",
        "leaderboard",
        username,
      ]);
      existingScore = result ? Number(result) : null;
    }

    // If user exists and new score is higher, or user doesn't exist, update the score
    if (existingScore === null || body.score > existingScore) {
      // Add/update the score in the sorted set
      // Use raw Redis command which is most reliable
      try {
        await redisAny.sendCommand([
          "ZADD",
          "leaderboard",
          body.score.toString(),
          username,
        ]);
      } catch (zaddError) {
        console.error("ZADD command error:", zaddError);
        // Try alternative formats as fallback
        if (typeof redisAny.zAdd === "function") {
          try {
            // Try: zAdd(key, { member, score })
            await redisAny.zAdd("leaderboard", {
              member: username,
              score: body.score,
            });
          } catch (e1) {
            try {
              // Try: zAdd(key, { score, member })
              await redisAny.zAdd("leaderboard", {
                score: body.score,
                member: username,
              });
            } catch (e2) {
              // Try: zAdd(key, score, member) as separate args
              await redisAny.zAdd("leaderboard", body.score, username);
            }
          }
        } else if (typeof redisAny.zadd === "function") {
          await redisAny.zadd("leaderboard", body.score, username);
        } else {
          throw zaddError;
        }
      }

      // Get the new rank (position) of the user (0-indexed, descending order)
      let rank: number | null = null;
      if (typeof redisAny.zrevrank === "function") {
        rank = await redisAny.zrevrank("leaderboard", username);
      } else if (typeof redisAny.zRank === "function") {
        rank = await redisAny.zRank("leaderboard", username, { rev: true });
      } else {
        const result = await redisAny.sendCommand([
          "ZREVRANK",
          "leaderboard",
          username,
        ]);
        rank = result !== null ? Number(result) : null;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: true,
          message: existingScore === null ? "Score added" : "Score updated",
          username,
          score: body.score,
          position: rank !== null ? rank + 1 : null, // rank is 0-indexed
        })
      );
      return;
    } else {
      // Score is not higher, return existing score info
      let rank: number | null = null;
      if (typeof redisAny.zrevrank === "function") {
        rank = await redisAny.zrevrank("leaderboard", username);
      } else if (typeof redisAny.zRank === "function") {
        rank = await redisAny.zRank("leaderboard", username, { rev: true });
      } else {
        const result = await redisAny.sendCommand([
          "ZREVRANK",
          "leaderboard",
          username,
        ]);
        rank = result !== null ? Number(result) : null;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          message: "Score not higher than existing score",
          username,
          currentScore: existingScore,
          submittedScore: body.score,
          position: rank !== null ? rank + 1 : null,
        })
      );
      return;
    }
  } catch (error) {
    console.error("Error submitting score:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to submit score";

    // Check if Redis environment variables are missing
    const redisUrl =
      process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const redisToken =
      process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Redis configuration missing. Please set KV_REST_API_URL and KV_REST_API_TOKEN environment variables.",
          success: false,
        })
      );
      return;
    }

    // Check if it's a Redis connection error
    if (
      errorMessage.includes("UPSTASH") ||
      errorMessage.includes("Redis") ||
      errorMessage.includes("connection")
    ) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Database connection failed. Please check your Redis configuration.",
          details: errorMessage,
          success: false,
        })
      );
      return;
    }

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: errorMessage,
        type: "server_error",
        success: false,
      })
    );
  }
}
