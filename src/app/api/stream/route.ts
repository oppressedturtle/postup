/**
 * /api/stream
 *
 * GET — Personalised home feed ("The Stream").
 *
 * Authenticated: returns drops from the hubs the caller is a member of,
 *                sorted by hot score, with cursor pagination.
 * Unauthenticated: returns the top 20 global drops by heat (no pagination).
 *
 * Query params:
 *   cursor?  — opaque cursor (drop ID) for pagination (authenticated only)
 *   limit?   — 1–50, default 20
 *
 * Responses:
 *   200  { drops, nextCursor }
 *   500  internal error
 *
 * Caching:
 *   - Results cached in Redis for 60 s, keyed on (userId | "anon", cursor).
 *   - Invalidated by the vote and drop creation routes which call feed:* SCAN+DEL.
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import { hotScore } from "@/lib/ranking";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Shared include shape
// ---------------------------------------------------------------------------

const dropInclude = {
  author: { select: { id: true, handle: true, displayName: true, avatar: true } },
  hub: { select: { id: true, slug: true, name: true, icon: true } },
  _count: { select: { replies: true, votes: true } },
} as const;

// ---------------------------------------------------------------------------
// GET /api/stream
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limitParam = searchParams.get("limit") ?? "20";
  const limit = Math.min(50, Math.max(1, parseInt(limitParam, 10) || 20));

  // Determine caller identity (optional auth)
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const cacheKey = `stream:${userId ?? "anon"}:${cursor ?? "start"}`;

  // Redis cache read
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), { headers: { "X-Cache": "HIT" } });
    }
  } catch {
    // Degrade gracefully — proceed to DB
  }

  try {
    // For hot sort we restrict to last 72 hours to keep the candidate set small
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);

    let drops: Awaited<ReturnType<typeof db.drop.findMany>>;

    if (userId) {
      // Authenticated: personalised feed — drops from member hubs
      const memberships = await db.membership.findMany({
        where: { userId },
        select: { hubId: true },
      });

      const hubIds = memberships.map((m) => m.hubId);

      if (hubIds.length === 0) {
        // User has no hub memberships — fall back to global hot feed
        drops = await db.drop.findMany({
          where: { isRemoved: false, createdAt: { gt: cutoff } },
          orderBy: [{ heat: "desc" }, { createdAt: "desc" }],
          // Fetch more than limit so we have enough after re-sort + pagination
          take: limit * 3,
          include: dropInclude,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
      } else {
        const where: Prisma.DropWhereInput = {
          isRemoved: false,
          hubId: { in: hubIds },
          createdAt: { gt: cutoff },
        };

        drops = await db.drop.findMany({
          where,
          orderBy: [{ heat: "desc" }, { createdAt: "desc" }],
          take: limit * 3,
          include: dropInclude,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
      }
    } else {
      // Unauthenticated: global hot feed, no pagination
      drops = await db.drop.findMany({
        where: { isRemoved: false, createdAt: { gt: cutoff } },
        orderBy: [{ heat: "desc" }, { createdAt: "desc" }],
        take: 20,
        include: dropInclude,
      });
    }

    // Re-sort in application layer using hotScore for time decay
    const sorted = drops
      .map((d) => ({ drop: d, score: hotScore(d.heat, d.createdAt) }))
      .sort((a, b) => b.score - a.score)
      .map(({ drop }) => drop);

    let page: typeof sorted;
    let nextCursor: string | null = null;

    if (userId) {
      const hasMore = sorted.length > limit;
      page = hasMore ? sorted.slice(0, limit) : sorted;
      nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;
    } else {
      page = sorted.slice(0, 20);
      nextCursor = null;
    }

    const payload = { drops: page, nextCursor };

    // Cache for 60 s
    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 60);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err, userId: userId ?? "anon" }, "stream: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve stream." } },
      { status: 500 },
    );
  }
}
