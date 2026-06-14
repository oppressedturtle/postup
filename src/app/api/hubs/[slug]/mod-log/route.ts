/**
 * /api/hubs/[slug]/mod-log
 *
 * GET — Public paginated mod log for a hub.
 *
 * Mod logs are public for transparency (Reddit-style public moderation log).
 *
 * Query params:
 *   cursor?  — pagination cursor (last ModLog id)
 *   limit?   — 1–50 (default 50)
 *
 * GET responses:
 *   200 { logs, nextCursor }
 *   404 hub not found
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ slug: string }> };

// ---------------------------------------------------------------------------
// GET /api/hubs/[slug]/mod-log
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;
  const { searchParams } = request.nextUrl;

  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

  const cacheKey = `modlog:${slug}:${cursor ?? "start"}:${limit}`;

  // 60s cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), {
        headers: { "X-Cache": "HIT" },
      });
    }
  } catch {
    // Degrade gracefully
  }

  const hub = await db.hub.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!hub) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Hub "${slug}" not found.` } },
      { status: 404 },
    );
  }

  try {
    const logs = await db.modLog.findMany({
      where: { hubId: hub.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        action: true,
        reason: true,
        targetUserId: true,
        dropId: true,
        replyId: true,
        reportId: true,
        createdAt: true,
        moderator: {
          select: { handle: true, avatar: true, displayName: true },
        },
      },
    });

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    const payload = { logs: page, nextCursor };

    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 60);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err, slug }, "mod-log: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve mod log." } },
      { status: 500 },
    );
  }
}
