/**
 * /api/user/stash
 *
 * GET — Return the authenticated user's stashed drops, newest first, paginated.
 *
 * Query params:
 *   limit  — 1–50 (default 20)
 *   cursor — stash record ID for cursor pagination
 *
 * Responses:
 *   200  { stash: [...], nextCursor: string | null }
 *   401  unauthenticated
 *   500  internal error
 *
 * Caching: 30s per (userId, cursor).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireAuth } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const stashQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? parseInt(v, 10) : 20;
      return Math.min(50, Math.max(1, Number.isNaN(n) ? 20 : n));
    }),
  cursor: z.string().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/user/stash
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const { searchParams } = request.nextUrl;

  const parsed = stashQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { limit, cursor } = parsed.data;

  const cacheKey = `stash:${user.id}:${cursor ?? "start"}:${limit}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), {
        headers: { "X-Cache": "HIT" },
      });
    }
  } catch {
    // Non-fatal cache miss
  }

  try {
    const stashEntries = await db.stash.findMany({
      where: { userId: user.id },
      orderBy: { savedAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        drop: {
          include: {
            author: {
              select: { id: true, handle: true, displayName: true, avatar: true },
            },
            hub: {
              select: { id: true, slug: true, name: true, icon: true },
            },
            _count: { select: { replies: true } },
          },
        },
      },
    });

    // Filter out stash entries for removed drops (may have been soft-deleted since stashing)
    const visible = stashEntries.filter((s) => !s.drop.isRemoved);

    const hasMore = stashEntries.length > limit;
    const page = hasMore ? visible.slice(0, limit) : visible;
    const nextCursor = hasMore ? (stashEntries[limit - 1]?.id ?? null) : null;

    const payload = { stash: page, nextCursor };

    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 30);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err, userId: user.id }, "stash: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve stash." } },
      { status: 500 },
    );
  }
}
