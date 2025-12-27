import { Redis } from "@upstash/redis";

// Initialize Redis - reads from environment variables automatically
// Upstash provides KV_REST_API_URL and KV_REST_API_TOKEN
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

interface LeaderboardEntry {
  username: string;
  score: number;
  position: number;
}

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    // Get top 25 scores from Redis sorted set (sorted by score descending)
    // zrevrange returns an array alternating between member and score when withScores is true
    const leaderboard = await redis.zrevrange<string>("leaderboard", 0, 24, {
      withScores: true,
    });

    const entries: LeaderboardEntry[] = [];
    
    // Upstash Redis returns an array that alternates: [member1, score1, member2, score2, ...]
    if (Array.isArray(leaderboard)) {
      for (let i = 0; i < leaderboard.length; i += 2) {
        const username = leaderboard[i] as string;
        const score = leaderboard[i + 1];
        
        if (username && (typeof score === "number" || typeof score === "string")) {
          entries.push({
            username,
            score: Math.round(Number(score)),
            position: entries.length + 1,
          });
        }
      }
    }

    return new Response(JSON.stringify({ entries }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check if it's a Redis connection error
    const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!redisUrl || !redisToken) {
      return new Response(
        JSON.stringify({ 
          error: "Redis configuration missing. Please set KV_REST_API_URL and KV_REST_API_TOKEN environment variables.",
          entries: []
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
        error: "Failed to fetch leaderboard",
        details: errorMessage,
        entries: []
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

