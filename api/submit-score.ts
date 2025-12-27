import { Redis } from "@upstash/redis";

// Initialize Redis - reads from environment variables automatically
// Upstash provides KV_REST_API_URL and KV_REST_API_TOKEN
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

interface SubmitScoreRequest {
  username: string;
  score: number;
}

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    const body: SubmitScoreRequest = await req.json();

    // Validate input
    if (!body.username || typeof body.username !== "string") {
      return new Response(
        JSON.stringify({ error: "Username is required and must be a string" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    if (
      typeof body.score !== "number" ||
      body.score < 0 ||
      !Number.isInteger(body.score)
    ) {
      return new Response(
        JSON.stringify({
          error: "Score must be a non-negative integer",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Sanitize username (limit length, remove special characters)
    const username = body.username.trim().slice(0, 50).replace(/[^a-zA-Z0-9_-]/g, "");

    if (username.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid username format" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Check if user already exists
    const existingScore = await redis.zscore("leaderboard", username);

    // If user exists and new score is higher, or user doesn't exist, update the score
    if (existingScore === null || body.score > existingScore) {
      // Add/update the score in the sorted set
      // ZADD adds the member with the score, or updates if it exists
      await redis.zadd("leaderboard", body.score, username);

      // Get the new rank (position) of the user
      const rank = await redis.zrevrank("leaderboard", username);

      return new Response(
        JSON.stringify({
          success: true,
          message: existingScore === null ? "Score added" : "Score updated",
          username,
          score: body.score,
          position: rank !== null ? rank + 1 : null, // rank is 0-indexed
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } else {
      // Score is not higher, return existing score info
      const rank = await redis.zrevrank("leaderboard", username);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Score not higher than existing score",
          username,
          currentScore: existingScore,
          submittedScore: body.score,
          position: rank !== null ? rank + 1 : null,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  } catch (error) {
    console.error("Error submitting score:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to submit score";
    
    // Check if Redis environment variables are missing
    const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!redisUrl || !redisToken) {
      return new Response(
        JSON.stringify({ 
          error: "Redis configuration missing. Please set KV_REST_API_URL and KV_REST_API_TOKEN environment variables.",
          success: false
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
    
    // Check if it's a Redis connection error
    if (errorMessage.includes("UPSTASH") || errorMessage.includes("Redis") || errorMessage.includes("connection")) {
      return new Response(
        JSON.stringify({ 
          error: "Database connection failed. Please check your Redis configuration.",
          details: errorMessage,
          success: false
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        type: "server_error",
        success: false
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

