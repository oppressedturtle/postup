/**
 * /api/replies/[id]/moderate
 *
 * POST — Apply a moderation action to a Reply.
 *
 * Caller must be a WARDEN of the reply's hub or an OVERSEER.
 *
 * Actions:
 *   remove  — soft-delete: isRemoved=true, body overwritten with "[removed]"
 *   restore — undo remove: isRemoved=false (body cannot be recovered)
 *
 * POST responses:
 *   200  { reply }
 *   400  invalid JSON
 *   401  unauthenticated
 *   403  not a Warden or Overseer
 *   404  reply not found
 *   422  validation error
 *   500  internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireAuth } from "@/lib/auth-helpers";
import { logModAction, ModActionType } from "@/lib/mod-log";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const moderateReplySchema = z.object({
  action: z.enum(["remove", "restore"]),
  reason: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// POST /api/replies/[id]/moderate
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  // --- Auth ---
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // --- Fetch reply with hub context (via drop) ---
  const reply = await db.reply.findUnique({
    where: { id },
    select: {
      id: true,
      dropId: true,
      authorId: true,
      isRemoved: true,
      drop: { select: { hubId: true } },
    },
  });

  if (!reply) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Reply not found." } },
      { status: 404 },
    );
  }

  // --- Authorization: WARDEN of reply's hub or OVERSEER ---
  const isOverseer = user.role === "OVERSEER";

  if (!isOverseer) {
    const membership = await db.membership.findUnique({
      where: { userId_hubId: { userId: user.id, hubId: reply.drop.hubId } },
      select: { role: true },
    });

    if (!membership || membership.role !== "WARDEN") {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You must be a Warden of this hub or an Overseer to moderate replies.",
          },
        },
        { status: 403 },
      );
    }
  }

  // --- Parse body ---
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = moderateReplySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid moderation action.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { action, reason } = parsed.data;

  const updateData =
    action === "remove"
      ? { isRemoved: true, body: "[removed]" }
      : { isRemoved: false };

  try {
    const updated = await db.reply.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        body: true,
        isRemoved: true,
        dropId: true,
        updatedAt: true,
      },
    });

    // --- Invalidate reply caches ---
    try {
      const keys = [
        `reply:${id}`,
        ...(await redis.keys(`replies:${reply.dropId}:*`)),
      ];
      if (keys.length > 0) await redis.del(...keys);
    } catch {
      // Non-fatal
    }

    // --- Log mod action ---
    await logModAction({
      hubId: reply.drop.hubId,
      moderatorId: user.id,
      action: action === "remove" ? ModActionType.REMOVE_REPLY : ModActionType.RESTORE_REPLY,
      replyId: id,
      reason,
    });

    logger.info(
      { userId: user.id, replyId: id, action, hubId: reply.drop.hubId },
      "reply: moderation action applied",
    );

    return NextResponse.json({ reply: updated });
  } catch (err) {
    logger.error({ err, userId: user.id, replyId: id, action }, "reply: moderate POST failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to apply moderation action." } },
      { status: 500 },
    );
  }
}
