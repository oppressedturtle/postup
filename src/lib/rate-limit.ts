/**
 * Redis-based sliding window rate limiter for PostUp.
 *
 * Uses a sorted set keyed per (identifier, window) to count requests within a
 * rolling time window. Each request adds the current timestamp as a score; old
 * entries outside the window are pruned on every check. This gives true sliding
 * window semantics without a INCR+EXPIRE race condition.
 *
 * The implementation is a single Lua script executed atomically so there are no
 * TOCTOU issues under concurrent load.
 *
 * Usage:
 *   const result = await rateLimit("ip:1.2.3.4", 10, 60);
 *   if (!result.success) return new Response("Too many requests", { status: 429 });
 */
import { redis } from "@/lib/redis";

export interface RateLimitResult {
  /** Whether this request is within the allowed limit. */
  success: boolean;
  /** How many requests remain in the current window. */
  remaining: number;
  /** Unix timestamp (seconds) when the window resets. */
  reset: number;
}

/**
 * Check and record a rate-limited request.
 *
 * @param key            Unique identifier, e.g. "login:ip:1.2.3.4"
 * @param limit          Maximum number of requests allowed in the window.
 * @param windowSeconds  Length of the sliding window in seconds.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now(); // ms
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;
  const resetTs = Math.ceil((now + windowMs) / 1000); // unix seconds

  // Lua script — runs atomically:
  //   1. Remove entries older than the window
  //   2. Count remaining entries
  //   3. If under the limit, add this request
  //   4. Set TTL so keys self-clean
  const luaScript = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local windowStart = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local windowMs = tonumber(ARGV[4])

    redis.call("ZREMRANGEBYSCORE", key, "-inf", windowStart)
    local count = redis.call("ZCARD", key)

    if count < limit then
      redis.call("ZADD", key, now, now)
      redis.call("PEXPIRE", key, windowMs)
      return {1, limit - count - 1}
    else
      redis.call("PEXPIRE", key, windowMs)
      return {0, 0}
    end
  `;

  const result = (await redis.eval(
    luaScript,
    1,
    `rl:${key}`,
    String(now),
    String(windowStart),
    String(limit),
    String(windowMs),
  )) as [number, number];

  const allowed = result[0] === 1;
  const remaining = result[1] ?? 0;

  return {
    success: allowed,
    remaining,
    reset: resetTs,
  };
}

// ---------------------------------------------------------------------------
// Preset limiters
// ---------------------------------------------------------------------------

/**
 * Auth limiter: 10 requests per 15 minutes, keyed on IP or email.
 * Apply to login and registration endpoints.
 */
export function authLimiter(ip: string): Promise<RateLimitResult> {
  return rateLimit(`auth:${ip}`, 10, 15 * 60);
}

// ---------------------------------------------------------------------------
// IP extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract the client IP from a Request object.
 *
 * Takes the first value from X-Forwarded-For (set by the outermost proxy) or
 * falls back to X-Real-IP. Returns "unknown" when neither header is present.
 *
 * // TODO: In production, configure your reverse proxy to strip and re-set
 * // X-Forwarded-For so only one trusted value is present. This prevents
 * // clients from spoofing their IP by injecting their own XFF header.
 *
 * @param request  The incoming Web API Request (or NextRequest)
 */
export function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    // Trust only the first value — this is the client IP when the proxy
    // prepends rather than replaces. A properly configured reverse proxy
    // strips client-supplied XFF and inserts a single trusted value.
    return xff.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Upload limiter: 5 requests per minute, keyed on userId.
 * Apply to media upload endpoints.
 */
export function uploadLimiter(userId: string): Promise<RateLimitResult> {
  return rateLimit(`upload:${userId}`, 5, 60);
}
