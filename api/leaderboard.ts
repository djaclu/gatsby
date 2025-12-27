import { Redis } from "@upstash/redis";

// Initialize Redis - reads from environment variables automatically
// Upstash provides KV_REST_API_URL and KV_REST_API_TOKEN
function getRedisClient() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  
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
    // Initialize Redis client
    let redis;
    try {
      redis = getRedisClient();
    } catch (initError) {
      console.error("Failed to initialize Redis:", initError);
      return new Response(
        JSON.stringify({ 
          error: "Redis configuration error",
          details: initError instanceof Error ? initError.message : String(initError),
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

    console.log("Fetching leaderboard from Redis...");
    
    // Get top 25 scores from Redis sorted set (sorted by score descending)
    // Use zRange with REV option to get scores in descending order
    let leaderboard: any;
    try {
      leaderboard = await redis.zRange("leaderboard", 0, 24, {
        rev: true,
        withScores: true,
      });
      console.log("Redis response type:", typeof leaderboard, Array.isArray(leaderboard) ? `array[${leaderboard.length}]` : "not array");
    } catch (redisError) {
      console.error("Redis zrevrange error:", redisError);
      // If the key doesn't exist, return empty array
      if (redisError instanceof Error && (redisError.message.includes("key") || redisError.message.includes("not found"))) {
        console.log("Leaderboard key doesn't exist yet, returning empty");
        return new Response(JSON.stringify({ entries: [] }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      throw redisError;
    }

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
    } else if (leaderboard && typeof leaderboard === "object") {
      // Handle case where it might be an object/Record
      console.log("Leaderboard is object, converting...");
      let position = 1;
      for (const [username, score] of Object.entries(leaderboard)) {
        entries.push({
          username,
          score: Math.round(Number(score)),
          position: position++,
        });
      }
    }

    console.log(`Returning ${entries.length} entries`);

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
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error("Error details:", {
      message: errorMessage,
      stack: errorStack,
      env: {
        hasUrl: !!process.env.KV_REST_API_URL,
        hasToken: !!process.env.KV_REST_API_TOKEN,
      }
    });
    
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

