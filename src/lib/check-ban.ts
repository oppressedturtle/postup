/**
 * Hub ban check helper for PostUp.
 *
 * Answers whether a user is currently banned from a hub. Results are cached in
 * Redis for 5 minutes so the check is a cache hit on the hot path (posting /
 * replying) rather than a DB query every time.
 *
 * Cache key: `ban:<userId>:<hubId>` → "1" (banned) | "0" (not banned)
 */
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import logger from "@/lib/logger";

const BAN_CACHE_TTL = 5 * 60; // 5 minutes

/**
 * Returns true if userId is currently banned from hubId.
 *
 * On Redis failure the function falls back to a direct DB query so that a
 * Redis outage does not unblock banned users.
 */
export async function isUserBanned(
  userId: string,
  hubId: string,
): Promise<boolean> {
  const cacheKey = `ban:${userId}:${hubId}`;

  // --- Cache read ---
  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === "1";
    }
  } catch (err) {
    logger.warn({ err, userId, hubId }, "check-ban: Redis read failed, falling back to DB");
  }

  // --- DB query ---
  try {
    const ban = await db.hubBan.findUnique({
      where: { userId_hubId: { userId, hubId } },
      select: { id: true },
    });

    const banned = ban !== null;

    // Back-fill cache
    try {
      await redis.set(cacheKey, banned ? "1" : "0", "EX", BAN_CACHE_TTL);
    } catch {
      // Non-fatal
    }

    return banned;
  } catch (err) {
    logger.error({ err, userId, hubId }, "check-ban: DB query failed");
    // Safe default: do not block user on infrastructure failure
    return false;
  }
}

/**
 * Invalidate the ban cache for a specific (userId, hubId) pair.
 * Call after banning or unbanning a user.
 */
export async function invalidateBanCache(
  userId: string,
  hubId: string,
): Promise<void> {
  try {
    await redis.del(`ban:${userId}:${hubId}`);
  } catch {
    // Non-fatal
  }
}
