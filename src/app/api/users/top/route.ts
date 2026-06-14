/**
 * /api/users/top
 *
 * GET — Top 10 users by Clout (public, cached 5 minutes).
 *
 * Used by the sidebar Clout leaderboard widget.
 *
 * Responses:
 *   200  { users: Array<{ handle, displayName, avatar, clout }> }
 *   500  internal error
 */
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import logger from "@/lib/logger";

const CACHE_KEY = "leaderboard:clout:top10";
const CACHE_TTL = 5 * 60; // 5 minutes

// ---------------------------------------------------------------------------
// GET /api/users/top
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  // Try cache first
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), { headers: { "X-Cache": "HIT" } });
    }
  } catch {
    // Degrade gracefully
  }

  try {
    const users = await db.user.findMany({
      orderBy: { clout: "desc" },
      take: 10,
      select: {
        handle: true,
        displayName: true,
        avatar: true,
        clout: true,
      },
    });

    const payload = { users };

    try {
      await redis.set(CACHE_KEY, JSON.stringify(payload), "EX", CACHE_TTL);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err }, "users:top: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve leaderboard." } },
      { status: 500 },
    );
  }
}
