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

    // Check if user already exists using REST API
    const url =
      process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token =
      process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error("Redis REST API credentials not found");
    }

    let existingScore: number | null = null;
    try {
      const scoreResponse = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(["ZSCORE", "leaderboard", username]),
      });

      if (scoreResponse.ok) {
        const scoreResultText = await scoreResponse.text();
        console.log("ZSCORE REST API raw response:", scoreResultText);
        let scoreResult;
        try {
          scoreResult = JSON.parse(scoreResultText);
          // Upstash REST API wraps result in { result: value }
          if (
            scoreResult &&
            typeof scoreResult === "object" &&
            "result" in scoreResult
          ) {
            scoreResult = scoreResult.result;
          }
          console.log("ZSCORE parsed result:", scoreResult);
          existingScore =
            scoreResult !== null &&
            scoreResult !== undefined &&
            scoreResult !== ""
              ? Number(scoreResult)
              : null;
          // Check if it's a valid number
          if (existingScore !== null && isNaN(existingScore)) {
            existingScore = null;
          }
        } catch (parseError) {
          console.error("Failed to parse ZSCORE response:", parseError);
          existingScore = null;
        }
        console.log("Existing score for", username, ":", existingScore);
      }
    } catch (scoreError) {
      console.error("Failed to check existing score:", scoreError);
      // Continue - assume no existing score
    }

    // If user exists and new score is higher, or user doesn't exist, update the score
    if (existingScore === null || body.score > existingScore) {
      // Add/update the score in the sorted set
      // Use Upstash REST API directly to bypass library validation issues

      try {
        // Upstash REST API format: POST to URL with command array in body
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([
            "ZADD",
            "leaderboard",
            body.score.toString(),
            username,
          ]),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Upstash REST API error:", response.status, errorText);
          throw new Error(`Upstash API error: ${response.status} ${errorText}`);
        }

        const resultText = await response.text();
        console.log(
          "ZADD REST API raw response:",
          resultText,
          "Status:",
          response.status
        );
        let result;
        try {
          result = JSON.parse(resultText);
          console.log("ZADD successful via REST API, parsed result:", result);
        } catch (parseError) {
          console.log(
            "ZADD response is not JSON, treating as success:",
            resultText
          );
          result = resultText;
        }

        // Verify the score was actually added by checking it immediately
        try {
          const verifyResponse = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(["ZSCORE", "leaderboard", username]),
          });
          if (verifyResponse.ok) {
            const verifyResult = await verifyResponse.text();
            console.log(
              "Verification - ZSCORE result for",
              username,
              ":",
              verifyResult
            );
          }
        } catch (verifyError) {
          console.error("Failed to verify score was added:", verifyError);
        }
      } catch (restError) {
        console.error("REST API call failed:", restError);
        // Fallback to library method if REST API fails
        const redisAny = redis as any;
        if (typeof redisAny.zAdd === "function") {
          await redisAny.zAdd("leaderboard", {
            score: body.score,
            member: username,
          });
        } else if (typeof redisAny.zadd === "function") {
          await redisAny.zadd("leaderboard", body.score, username);
        } else {
          throw restError;
        }
      }

      // Get the new rank (position) of the user (0-indexed, descending order)
      // Use REST API to get rank
      let rank: number | null = null;
      try {
        const rankResponse = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(["ZREVRANK", "leaderboard", username]),
        });

        if (rankResponse.ok) {
          const rankResultText = await rankResponse.text();
          let rankResult;
          try {
            rankResult = JSON.parse(rankResultText);
            // Upstash REST API wraps result in { result: value }
            if (
              rankResult &&
              typeof rankResult === "object" &&
              "result" in rankResult
            ) {
              rankResult = rankResult.result;
            }
            rank =
              rankResult !== null && rankResult !== undefined
                ? Number(rankResult)
                : null;
            if (rank !== null && isNaN(rank)) {
              rank = null;
            }
          } catch (parseError) {
            console.error("Failed to parse ZREVRANK response:", parseError);
            rank = null;
          }
        }
      } catch (rankError) {
        console.error("Failed to get rank:", rankError);
        // Continue without rank - it's not critical
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
      // Get rank using REST API
      let rank: number | null = null;
      try {
        const rankResponse = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(["ZREVRANK", "leaderboard", username]),
        });

        if (rankResponse.ok) {
          const rankResultText = await rankResponse.text();
          let rankResult;
          try {
            rankResult = JSON.parse(rankResultText);
            // Upstash REST API wraps result in { result: value }
            if (
              rankResult &&
              typeof rankResult === "object" &&
              "result" in rankResult
            ) {
              rankResult = rankResult.result;
            }
            rank =
              rankResult !== null && rankResult !== undefined
                ? Number(rankResult)
                : null;
            if (rank !== null && isNaN(rank)) {
              rank = null;
            }
          } catch (parseError) {
            console.error("Failed to parse ZREVRANK response:", parseError);
            rank = null;
          }
        }
      } catch (rankError) {
        console.error("Failed to get rank:", rankError);
        // Continue without rank - it's not critical
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
