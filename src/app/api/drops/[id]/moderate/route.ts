/**
 * /api/drops/[id]/moderate
 *
 * POST — Apply a moderation action to a Drop.
 *
 * Caller must be a WARDEN of the drop's hub or an OVERSEER.
 *
 * Actions:
 *   pin      — set isPinned=true
 *   unpin    — set isPinned=false
 *   lock     — set isLocked=true  (prevents new replies)
 *   unlock   — set isLocked=false
 *   remove   — soft-delete: isRemoved=true, clear body/media for privacy
 *   restore  — undo remove: isRemoved=false
 *
 * POST responses:
 *   200  { drop }  — updated drop fields
 *   400  invalid JSON
 *   401  unauthenticated
 *   403  not a Warden or Overseer
 *   404  drop not found
 *   422  validation error
 *   500  internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireAuth } from "@/lib/auth-helpers";
import { logModAction, ModActionType } from "@/lib/mod-log";
import { Prisma } from "@/generated/prisma/client";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const moderateDropSchema = z.object({
  action: z.enum(["pin", "unpin", "lock", "unlock", "remove", "restore"]),
  reason: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Action → ModActionType mapping
// ---------------------------------------------------------------------------

const ACTION_MAP: Record<string, ModActionType> = {
  pin: ModActionType.PIN_DROP,
  unpin: ModActionType.UNPIN_DROP,
  lock: ModActionType.LOCK_DROP,
  unlock: ModActionType.UNLOCK_DROP,
  remove: ModActionType.REMOVE_DROP,
  restore: ModActionType.RESTORE_DROP,
};

// ---------------------------------------------------------------------------
// POST /api/drops/[id]/moderate
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

  // --- Fetch drop with hub context ---
  const drop = await db.drop.findUnique({
    where: { id },
    select: {
      id: true,
      hubId: true,
      authorId: true,
      isRemoved: true,
      isPinned: true,
      isLocked: true,
      hub: { select: { id: true, slug: true } },
    },
  });

  if (!drop) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Drop not found." } },
      { status: 404 },
    );
  }

  // --- Authorization: WARDEN of this hub or OVERSEER ---
  const isOverseer = user.role === "OVERSEER";

  if (!isOverseer) {
    const membership = await db.membership.findUnique({
      where: { userId_hubId: { userId: user.id, hubId: drop.hubId } },
      select: { role: true },
    });

    if (!membership || membership.role !== "WARDEN") {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You must be a Warden of this hub or an Overseer to moderate drops.",
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

  const parsed = moderateDropSchema.safeParse(rawBody);
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

  // --- Build update data ---
  let updateData: Prisma.DropUpdateInput;

  switch (action) {
    case "pin":
      updateData = { isPinned: true };
      break;
    case "unpin":
      updateData = { isPinned: false };
      break;
    case "lock":
      updateData = { isLocked: true };
      break;
    case "unlock":
      updateData = { isLocked: false };
      break;
    case "remove":
      updateData = {
        isRemoved: true,
        body: null,
        imageUrl: null,
        videoUrl: null,
        linkUrl: null,
        linkPreview: Prisma.JsonNull,
      };
      break;
    case "restore":
      updateData = { isRemoved: false };
      break;
    default:
      updateData = {};
  }

  try {
    const updated = await db.drop.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        title: true,
        isPinned: true,
        isLocked: true,
        isRemoved: true,
        updatedAt: true,
      },
    });

    // --- Invalidate feed caches ---
    try {
      await redis.del(`drop:${id}`);
      const feedKeys = await redis.keys(`feed:*`);
      if (feedKeys.length > 0) await redis.del(...feedKeys);
    } catch {
      // Non-fatal
    }

    // --- Log mod action ---
    await logModAction({
      hubId: drop.hubId,
      moderatorId: user.id,
      action: ACTION_MAP[action]!,
      dropId: id,
      reason,
    });

    logger.info(
      { userId: user.id, dropId: id, action, hubId: drop.hubId },
      "drop: moderation action applied",
    );

    return NextResponse.json({ drop: updated });
  } catch (err) {
    logger.error({ err, userId: user.id, dropId: id, action }, "drop: moderate POST failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to apply moderation action." } },
      { status: 500 },
    );
  }
}
