/**
 * /api/drops/[id]
 *
 * GET    — Fetch a single Drop by ID (public).
 * PATCH  — Update a Drop (author only; TEXT drops only).
 * DELETE — Soft-delete a Drop (author, hub WARDEN, or OVERSEER).
 *
 * GET responses:
 *   200  { drop }
 *   404  drop not found
 *   500  internal error
 *
 * PATCH responses:
 *   200  { drop }
 *   400  invalid JSON
 *   401  unauthenticated
 *   403  not the author
 *   404  drop not found
 *   422  validation error / cannot edit non-TEXT drop
 *   500  internal error
 *
 * DELETE responses:
 *   200  { success: true }
 *   401  unauthenticated
 *   403  not authorized
 *   404  drop not found
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

const patchDropSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  body: z.string().max(40_000).optional(),
});

// ---------------------------------------------------------------------------
// Shared include shape
// ---------------------------------------------------------------------------

const dropInclude = {
  author: { select: { id: true, handle: true, displayName: true, avatar: true } },
  hub: { select: { id: true, slug: true, name: true, icon: true } },
  _count: { select: { replies: true, votes: true } },
} as const;

// ---------------------------------------------------------------------------
// GET /api/drops/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const cacheKey = `drop:${id}`;

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
    const drop = await db.drop.findUnique({
      where: { id },
      include: dropInclude,
    });

    if (!drop || drop.isRemoved) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Drop not found." } },
        { status: 404 },
      );
    }

    const payload = { drop };

    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 60);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err, dropId: id }, "drop: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve drop." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/drops/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // Fetch drop
  const drop = await db.drop.findUnique({
    where: { id },
    select: { id: true, authorId: true, type: true, isRemoved: true, hub: { select: { slug: true } } },
  });

  if (!drop || drop.isRemoved) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Drop not found." } },
      { status: 404 },
    );
  }

  // Author only
  if (drop.authorId !== user.id) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only the author can edit this drop." } },
      { status: 403 },
    );
  }

  // TEXT drops only
  if (drop.type !== "TEXT") {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Only TEXT drops can be edited.",
        },
      },
      { status: 422 },
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

  const parsed = patchDropSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid drop update data.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  if (parsed.data.title === undefined && parsed.data.body === undefined) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "At least one field (title or body) must be provided.",
        },
      },
      { status: 422 },
    );
  }

  try {
    const updated = await db.drop.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
      },
      include: dropInclude,
    });

    // Invalidate caches
    try {
      await redis.del(`drop:${id}`);
      const feedKeys = await redis.keys(`feed:*`);
      if (feedKeys.length > 0) await redis.del(...feedKeys);
    } catch {
      // Non-fatal
    }

    logger.info({ userId: user.id, dropId: id }, "drop: PATCH updated");
    return NextResponse.json({ drop: updated });
  } catch (err) {
    logger.error({ err, userId: user.id, dropId: id }, "drop: PATCH failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update drop." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/drops/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // Fetch drop with hub info for warden check
  const drop = await db.drop.findUnique({
    where: { id },
    select: {
      id: true,
      authorId: true,
      isRemoved: true,
      hubId: true,
      hub: { select: { slug: true } },
    },
  });

  if (!drop || drop.isRemoved) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Drop not found." } },
      { status: 404 },
    );
  }

  // Authorization: author OR hub WARDEN OR OVERSEER
  const isAuthor = drop.authorId === user.id;
  const isOverseer = user.role === "OVERSEER";

  let isWarden = false;
  if (!isAuthor && !isOverseer) {
    const membership = await db.membership.findUnique({
      where: { userId_hubId: { userId: user.id, hubId: drop.hubId } },
    });
    isWarden = membership?.role === "WARDEN";
  }

  if (!isAuthor && !isOverseer && !isWarden) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Only the author, a Warden, or an Overseer can remove this drop.",
        },
      },
      { status: 403 },
    );
  }

  try {
    // Soft delete: mark as removed and clear content fields
    await db.drop.update({
      where: { id },
      data: {
        isRemoved: true,
        body: null,
        imageUrl: null,
        videoUrl: null,
        linkUrl: null,
        linkPreview: undefined,
      },
    });

    // Invalidate caches
    try {
      await redis.del(`drop:${id}`);
      const feedKeys = await redis.keys(`feed:*`);
      if (feedKeys.length > 0) await redis.del(...feedKeys);
    } catch {
      // Non-fatal
    }

    logger.info(
      { userId: user.id, dropId: id, isAuthor, isWarden, isOverseer },
      "drop: soft deleted",
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, userId: user.id, dropId: id }, "drop: DELETE failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to remove drop." } },
      { status: 500 },
    );
  }
}
