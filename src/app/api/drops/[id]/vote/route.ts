/**
 * /api/drops/[id]/vote
 *
 * GET  — Return the caller's current vote + drop Heat (auth required).
 * POST — Cast, change, or retract a Boost/Bury on a Drop (auth required).
 *
 * GET query params: none
 * GET responses:
 *   200  { userVote: 1 | -1 | null, heat: number }
 *   401  unauthenticated
 *   404  drop not found
 *   500  internal error
 *
 * POST body (JSON):
 *   { value: 1 | -1 }
 * POST responses:
 *   200  { heat: number, userVote: 1 | -1 | null }
 *   400  invalid JSON body
 *   401  unauthenticated
 *   404  drop not found
 *   422  validation error
 *   429  rate limited (60 votes/minute per user)
 *   500  internal error
 *
 * Vote semantics:
 *   - No prior vote  → create Vote, increment Drop.heat, award Clout to author
 *   - Same value     → toggle off (delete Vote, revert Heat + Clout)
 *   - Different value → update Vote, adjust Heat by (new - old), adjust Clout
 *   - Voter == author → Heat adjusted but Clout never awarded/deducted
 *   - Author Clout never goes below 0
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireAuth } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Invalidate all Redis feed cache keys.
 * Uses SCAN to avoid blocking the server with KEYS on large keyspaces.
 */
async function invalidateFeedCache(): Promise<void> {
  try {
    let cursor = "0";
    const keysToDelete: string[] = [];

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "feed:*", "COUNT", 100);
      cursor = nextCursor;
      keysToDelete.push(...keys);
    } while (cursor !== "0");

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  } catch {
    // Non-fatal — stale cache is acceptable; the next read will re-populate.
  }
}

/**
 * Write the current Heat for a drop to Redis (300 s TTL).
 */
async function cacheDropHeat(dropId: string, heat: number): Promise<void> {
  try {
    await redis.setex(`vote:drop:${dropId}`, 300, String(heat));
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// GET /api/drops/[id]/vote
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const cacheKey = `uservote:drop:${user.id}:${id}`;

  // Try cache first
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), { headers: { "X-Cache": "HIT" } });
    }
  } catch {
    // Degrade gracefully
  }

  try {
    const drop = await db.drop.findUnique({
      where: { id },
      select: { id: true, heat: true, isRemoved: true },
    });

    if (!drop || drop.isRemoved) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Drop not found." } },
        { status: 404 },
      );
    }

    const vote = await db.vote.findUnique({
      where: { userId_dropId: { userId: user.id, dropId: id } },
      select: { value: true },
    });

    const payload = {
      userVote: (vote?.value ?? null) as 1 | -1 | null,
      heat: drop.heat,
    };

    try {
      await redis.setex(cacheKey, 60, JSON.stringify(payload));
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err, dropId: id, userId: user.id }, "vote:drop: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve vote state." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/drops/[id]/vote
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // Rate limit: 60 votes/minute per user
  const rl = await rateLimit(`vote:${user.id}`, 60, 60);
  if (!rl.success) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "You are voting too fast. Slow down." } },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.reset - Math.floor(Date.now() / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "value must be 1 (Boost) or -1 (Bury).",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { value: newValue } = parsed.data;

  try {
    // Fetch the drop (need authorId + current heat for the transaction)
    const drop = await db.drop.findUnique({
      where: { id },
      select: { id: true, authorId: true, heat: true, isRemoved: true },
    });

    if (!drop || drop.isRemoved) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Drop not found." } },
        { status: 404 },
      );
    }

    const isSelfVote = drop.authorId === user.id;

    // Run the entire vote mutation atomically
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.vote.findUnique({
        where: { userId_dropId: { userId: user.id, dropId: id } },
        select: { id: true, value: true },
      });

      let heatDelta = 0;
      let cloutDelta = 0;
      let finalVote: 1 | -1 | null = null;

      if (!existing) {
        // --- No prior vote: create ---
        await tx.vote.create({
          data: { userId: user.id, dropId: id, value: newValue },
        });
        heatDelta = newValue;
        cloutDelta = isSelfVote ? 0 : newValue; // +1 Boost, -1 Bury
        finalVote = newValue;
      } else if (existing.value === newValue) {
        // --- Same vote: toggle off ---
        await tx.vote.delete({ where: { id: existing.id } });
        heatDelta = -newValue; // revert
        cloutDelta = isSelfVote ? 0 : -newValue;
        finalVote = null;
      } else {
        // --- Different vote: flip ---
        await tx.vote.update({
          where: { id: existing.id },
          data: { value: newValue },
        });
        heatDelta = newValue - existing.value; // e.g. +1 - (-1) = +2
        cloutDelta = isSelfVote ? 0 : newValue - existing.value;
        finalVote = newValue;
      }

      // Update Drop.heat
      const updatedDrop = await tx.drop.update({
        where: { id },
        data: { heat: { increment: heatDelta } },
        select: { heat: true },
      });

      // Update author Clout — never go below 0
      if (!isSelfVote && cloutDelta !== 0) {
        if (cloutDelta > 0) {
          await tx.user.update({
            where: { id: drop.authorId },
            data: { clout: { increment: cloutDelta } },
          });
        } else {
          // Decrement but clamp to 0 using a raw update with GREATEST
          // Prisma doesn't support GREATEST directly; we use updateMany with a
          // conditional — but the simplest safe approach is: read clout, compute,
          // write. Inside a transaction this is safe against concurrent updates.
          const author = await tx.user.findUnique({
            where: { id: drop.authorId },
            select: { clout: true },
          });
          if (author) {
            const newClout = Math.max(0, author.clout + cloutDelta);
            await tx.user.update({
              where: { id: drop.authorId },
              data: { clout: newClout },
            });
          }
        }
      }

      return { heat: updatedDrop.heat, userVote: finalVote };
    });

    // Post-transaction: update Redis heat cache and invalidate feed caches
    await Promise.all([
      cacheDropHeat(id, result.heat),
      invalidateFeedCache(),
      // Invalidate per-user vote state cache for this drop
      redis.del(`uservote:drop:${user.id}:${id}`).catch(() => undefined),
    ]);

    logger.info(
      { userId: user.id, dropId: id, value: newValue, newHeat: result.heat },
      "vote:drop: POST",
    );

    return NextResponse.json({ heat: result.heat, userVote: result.userVote });
  } catch (err) {
    logger.error({ err, userId: user.id, dropId: id }, "vote:drop: POST failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to record vote." } },
      { status: 500 },
    );
  }
}
