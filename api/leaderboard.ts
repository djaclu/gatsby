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

interface LeaderboardEntry {
  username: string;
  score: number;
  position: number;
}

// Helper function to set CORS headers
function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
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

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  // Parse difficulty from query string
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`
  );
  let difficulty = url.searchParams.get("difficulty") || "medium";
  difficulty = difficulty.toLowerCase();

  // Validate difficulty
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Invalid difficulty. Must be 'easy', 'medium', or 'hard'",
        entries: [],
      })
    );
    return;
  }

  // Use difficulty-specific leaderboard key
  const leaderboardKey = `leaderboard:${difficulty}`;

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
          entries: [],
        })
      );
      return;
    }

    console.log("Fetching leaderboard from Redis...");

    // Get top 25 scores from Redis sorted set (sorted by score descending)
    // Use Upstash REST API directly to ensure consistency with submit-score
    const url =
      process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token =
      process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error("Redis REST API credentials not found");
    }

    let leaderboard: any;
    try {
      // Use REST API directly: ZREVRANGE leaderboard 0 24 WITHSCORES
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          "ZREVRANGE",
          leaderboardKey,
          "0",
          "24",
          "WITHSCORES",
        ]),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Upstash REST API error:", response.status, errorText);
        // If key doesn't exist, return empty array
        if (
          response.status === 404 ||
          errorText.includes("key") ||
          errorText.includes("not found")
        ) {
          console.log("Leaderboard key doesn't exist yet, returning empty");
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ entries: [] }));
          return;
        }
        throw new Error(`Upstash API error: ${response.status} ${errorText}`);
      }

      const responseText = await response.text();
      console.log("Raw Redis REST API response:", responseText);

      try {
        leaderboard = JSON.parse(responseText);
        console.log(
          "Parsed Redis response type:",
          typeof leaderboard,
          Array.isArray(leaderboard)
            ? `array[${leaderboard.length}]`
            : "not array",
          "Value:",
          leaderboard
        );
      } catch (parseError) {
        console.error("Failed to parse response as JSON:", parseError);
        console.log("Response text:", responseText);
        // Try to handle as string or number
        leaderboard = responseText;
      }
    } catch (redisError) {
      console.error("Redis zrevrange error:", redisError);
      // If the key doesn't exist, return empty array
      if (
        redisError instanceof Error &&
        (redisError.message.includes("key") ||
          redisError.message.includes("not found") ||
          redisError.message.includes("404"))
      ) {
        console.log("Leaderboard key doesn't exist yet, returning empty");
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ entries: [] }));
        return;
      }
      throw redisError;
    }

    const entries: LeaderboardEntry[] = [];

    // Upstash REST API returns result wrapped in { result: [...] }
    // Extract the actual array from the result property
    let leaderboardArray: any = null;

    if (leaderboard && typeof leaderboard === "object") {
      // Check if it's wrapped in a result property (Upstash REST API format)
      if ("result" in leaderboard && Array.isArray(leaderboard.result)) {
        leaderboardArray = leaderboard.result;
        console.log(
          "Extracted result array from Upstash response:",
          leaderboardArray
        );
      } else if (Array.isArray(leaderboard)) {
        // Already an array
        leaderboardArray = leaderboard;
      } else {
        // Try to extract from other possible properties
        console.log("Leaderboard object structure:", Object.keys(leaderboard));
      }
    } else if (Array.isArray(leaderboard)) {
      leaderboardArray = leaderboard;
    }

    // Parse the array if we have one
    if (Array.isArray(leaderboardArray)) {
      // Check if it's the alternating format [member, score, member, score, ...]
      if (leaderboardArray.length > 0 && leaderboardArray.length % 2 === 0) {
        for (let i = 0; i < leaderboardArray.length; i += 2) {
          const username = leaderboardArray[i];
          const score = leaderboardArray[i + 1];

          if (
            username != null &&
            username !== "" &&
            (score != null || score !== undefined)
          ) {
            const scoreNum = Number(score);
            if (!isNaN(scoreNum)) {
              entries.push({
                username: String(username),
                score: Math.round(scoreNum),
                position: entries.length + 1,
              });
            }
          }
        }
        console.log(`Parsed ${entries.length} entries from leaderboard array`);
      } else if (leaderboardArray.length > 0) {
        // Might be a different format, log it for debugging
        console.log(
          "Unexpected leaderboard array format (length not even):",
          leaderboardArray.length,
          leaderboardArray
        );
      } else {
        console.log("Leaderboard array is empty");
      }
    } else if (leaderboard != null) {
      // Unexpected format
      console.log(
        "Unexpected leaderboard format:",
        typeof leaderboard,
        leaderboard
      );
    }

    console.log(`Returning ${entries.length} entries`);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ entries }));
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("Error details:", {
      message: errorMessage,
      stack: errorStack,
      env: {
        hasUrl: !!process.env.KV_REST_API_URL,
        hasToken: !!process.env.KV_REST_API_TOKEN,
      },
    });

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Failed to fetch leaderboard",
        details: errorMessage,
        entries: [],
      })
    );
  }
}
