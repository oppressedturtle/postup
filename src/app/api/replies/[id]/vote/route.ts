/**
 * /api/replies/[id]/vote
 *
 * POST — Cast, change, or retract a Boost/Bury on a Reply (auth required).
 *
 * Body: { value: 1 | -1 }
 *
 * Responses:
 *   200  { heat: number, userVote: 1 | -1 | null }
 *   400  invalid JSON body
 *   401  unauthenticated
 *   404  reply not found
 *   422  validation error
 *   429  rate limited (60 votes/minute per user, shared with drop votes)
 *   500  internal error
 *
 * Vote semantics mirror /api/drops/[id]/vote:
 *   - No prior vote  → create Vote, increment Reply.heat, award Clout to author
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
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// POST /api/replies/[id]/vote
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // Rate limit: 60 votes/minute per user (shared bucket with drop votes)
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
    const reply = await db.reply.findUnique({
      where: { id },
      select: { id: true, authorId: true, heat: true, isRemoved: true },
    });

    if (!reply || reply.isRemoved) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Reply not found." } },
        { status: 404 },
      );
    }

    const isSelfVote = reply.authorId === user.id;

    const result = await db.$transaction(async (tx) => {
      const existing = await tx.vote.findUnique({
        where: { userId_replyId: { userId: user.id, replyId: id } },
        select: { id: true, value: true },
      });

      let heatDelta = 0;
      let cloutDelta = 0;
      let finalVote: 1 | -1 | null = null;

      if (!existing) {
        // --- No prior vote: create ---
        await tx.vote.create({
          data: { userId: user.id, replyId: id, value: newValue },
        });
        heatDelta = newValue;
        cloutDelta = isSelfVote ? 0 : newValue;
        finalVote = newValue;
      } else if (existing.value === newValue) {
        // --- Same vote: toggle off ---
        await tx.vote.delete({ where: { id: existing.id } });
        heatDelta = -newValue;
        cloutDelta = isSelfVote ? 0 : -newValue;
        finalVote = null;
      } else {
        // --- Different vote: flip ---
        await tx.vote.update({
          where: { id: existing.id },
          data: { value: newValue },
        });
        heatDelta = newValue - existing.value;
        cloutDelta = isSelfVote ? 0 : newValue - existing.value;
        finalVote = newValue;
      }

      // Update Reply.heat
      const updatedReply = await tx.reply.update({
        where: { id },
        data: { heat: { increment: heatDelta } },
        select: { heat: true },
      });

      // Update author Clout — never go below 0
      if (!isSelfVote && cloutDelta !== 0) {
        if (cloutDelta > 0) {
          await tx.user.update({
            where: { id: reply.authorId },
            data: { clout: { increment: cloutDelta } },
          });
        } else {
          const author = await tx.user.findUnique({
            where: { id: reply.authorId },
            select: { clout: true },
          });
          if (author) {
            const newClout = Math.max(0, author.clout + cloutDelta);
            await tx.user.update({
              where: { id: reply.authorId },
              data: { clout: newClout },
            });
          }
        }
      }

      return { heat: updatedReply.heat, userVote: finalVote };
    });

    // Invalidate feed caches (reply heat can influence parent drop ranking in future phases)
    await invalidateFeedCache();

    logger.info(
      { userId: user.id, replyId: id, value: newValue, newHeat: result.heat },
      "vote:reply: POST",
    );

    return NextResponse.json({ heat: result.heat, userVote: result.userVote });
  } catch (err) {
    logger.error({ err, userId: user.id, replyId: id }, "vote:reply: POST failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to record vote." } },
      { status: 500 },
    );
  }
}
