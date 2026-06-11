/**
 * ioredis singleton for PostUp.
 *
 * Uses the same globalThis pattern as the Prisma client so that Next.js
 * hot-reloads in development don't spawn a new connection on every file
 * change and exhaust the Redis connection limit.
 */
import Redis from "ioredis";
import { env } from "./env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

function createRedisClient(): Redis {
  const client = new Redis(env.REDIS_URL, {
    // Disable auto-reconnect retries that would flood logs during intentional
    // shutdowns. Reconnect is still attempted on unexpected disconnects.
    maxRetriesPerRequest: null,
    // Surface connection errors rather than silently queuing commands.
    enableOfflineQueue: false,
    lazyConnect: false,
  });

  client.on("error", (err: Error) => {
    // Errors are emitted rather than thrown so the process doesn't crash on
    // transient network hiccups. Callers should treat failed Redis ops as
    // non-fatal where possible (cache miss, degrade gracefully).
    console.error("[redis] connection error", err.message);
  });

  return client;
}

export const redis: Redis =
  globalForRedis.redis ?? createRedisClient();

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/**
 * Send a PING to Redis and return the response ("PONG").
 * Useful in healthcheck endpoints to verify the connection is live.
 */
export async function ping(): Promise<string> {
  return redis.ping();
}
