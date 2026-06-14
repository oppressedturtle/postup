/**
 * /api/replies/[id]
 *
 * GET    — Fetch a single reply with author + parent context. Public.
 * PATCH  — Update reply body (author only).
 * DELETE — Soft-delete reply (author, hub WARDEN, or OVERSEER).
 *
 * GET responses:
 *   200  { reply }
 *   404  reply not found
 *   500  internal error
 *
 * PATCH responses:
 *   200  { reply }
 *   400  invalid JSON
 *   401  unauthenticated
 *   403  not the author
 *   404  reply not found
 *   422  validation error
 *   500  internal error
 *
 * DELETE responses:
 *   200  { success: true }
 *   401  unauthenticated
 *   403  not authorized
 *   404  reply not found
 *   500  internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireAuth } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const patchReplySchema = z.object({
  body: z.string().min(1).max(10_000),
});

// ---------------------------------------------------------------------------
// Shared select shape
// ---------------------------------------------------------------------------

const replyDetailSelect = {
  id: true,
  body: true,
  authorId: true,
  dropId: true,
  parentId: true,
  heat: true,
  isRemoved: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: { id: true, handle: true, displayName: true, avatar: true },
  },
  parent: {
    select: {
      id: true,
      body: true,
      isRemoved: true,
      author: {
        select: { id: true, handle: true, displayName: true, avatar: true },
      },
    },
  },
  _count: { select: { children: true } },
} as const;

// ---------------------------------------------------------------------------
// Cache invalidation helper
// ---------------------------------------------------------------------------

async function invalidateReplyCache(replyId: string, dropId: string): Promise<void> {
  try {
    const keys = [
      `reply:${replyId}`,
      ...(await redis.keys(`replies:${dropId}:*`)),
    ];
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// GET /api/replies/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const cacheKey = `reply:${id}`;

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

  try {
    const reply = await db.reply.findUnique({
      where: { id },
      select: replyDetailSelect,
    });

    if (!reply) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Reply not found." } },
        { status: 404 },
      );
    }

    // Sanitise removed reply bodies for the response
    const payload = {
      reply: reply.isRemoved ? { ...reply, body: "[removed]" } : reply,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 60);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err, replyId: id }, "reply: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve reply." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/replies/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const reply = await db.reply.findUnique({
    where: { id },
    select: { id: true, authorId: true, dropId: true, isRemoved: true },
  });

  if (!reply || reply.isRemoved) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Reply not found." } },
      { status: 404 },
    );
  }

  if (reply.authorId !== user.id) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only the author can edit this reply." } },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = patchReplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid reply update data.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  try {
    const updated = await db.reply.update({
      where: { id },
      data: { body: parsed.data.body },
      select: replyDetailSelect,
    });

    await invalidateReplyCache(id, reply.dropId);

    logger.info({ userId: user.id, replyId: id }, "reply: PATCH updated");
    return NextResponse.json({ reply: updated });
  } catch (err) {
    logger.error({ err, userId: user.id, replyId: id }, "reply: PATCH failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update reply." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/replies/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const reply = await db.reply.findUnique({
    where: { id },
    select: {
      id: true,
      authorId: true,
      dropId: true,
      isRemoved: true,
      drop: { select: { hubId: true } },
    },
  });

  if (!reply || reply.isRemoved) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Reply not found." } },
      { status: 404 },
    );
  }

  const isAuthor = reply.authorId === user.id;
  const isOverseer = user.role === "OVERSEER";

  let isWarden = false;
  if (!isAuthor && !isOverseer) {
    const membership = await db.membership.findUnique({
      where: {
        userId_hubId: { userId: user.id, hubId: reply.drop.hubId },
      },
      select: { role: true },
    });
    isWarden = membership?.role === "WARDEN";
  }

  if (!isAuthor && !isOverseer && !isWarden) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Only the author, a Warden, or an Overseer can remove this reply.",
        },
      },
      { status: 403 },
    );
  }

  try {
    // Soft-delete: preserve the node for thread integrity.
    await db.reply.update({
      where: { id },
      data: {
        isRemoved: true,
        body: "[removed]",
      },
    });

    await invalidateReplyCache(id, reply.dropId);

    logger.info(
      { userId: user.id, replyId: id, isAuthor, isWarden, isOverseer },
      "reply: soft deleted",
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, userId: user.id, replyId: id }, "reply: DELETE failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to remove reply." } },
      { status: 500 },
    );
  }
}
