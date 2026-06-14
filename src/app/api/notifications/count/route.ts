/**
 * /api/notifications/count
 *
 * GET — Returns the unread notification count for the authenticated user.
 *       Cached in Redis for 30 seconds per userId.
 *
 * Responses:
 *   200  { unread: number }
 *   401  unauthenticated
 *   500  internal error
 */
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireAuth } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// GET /api/notifications/count
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const cacheKey = `notif:unread:${user.id}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return NextResponse.json(
        { unread: parseInt(cached, 10) },
        { headers: { "X-Cache": "HIT" } },
      );
    }
  } catch {
    // Degrade gracefully — fall through to DB query
  }

  try {
    const unread = await db.notification.count({
      where: { userId: user.id, read: false },
    });

    try {
      await redis.set(cacheKey, String(unread), "EX", 30);
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ unread });
  } catch (err) {
    logger.error({ err, userId: user.id }, "notifications/count: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve notification count." } },
      { status: 500 },
    );
  }
}
