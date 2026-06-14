/**
 * /api/hubs/[slug]/bans
 *
 * GET    — List hub bans (paginated). WARDEN or OVERSEER only.
 * POST   — Ban a user from the hub. WARDEN or OVERSEER only.
 * DELETE — Unban a user from the hub. WARDEN or OVERSEER only.
 *
 * GET query params:
 *   cursor?  — pagination cursor (last HubBan id)
 *   limit?   — 1–50 (default 20)
 *
 * POST body:
 *   { handle: string, reason?: string }
 *
 * DELETE body:
 *   { handle: string }
 *
 * Responses:
 *   GET    200 { bans, nextCursor }
 *   POST   201 { ban }
 *   DELETE 200 { success: true }
 *   400/401/403/404/409/422/500
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { logModAction, ModActionType } from "@/lib/mod-log";
import { invalidateBanCache } from "@/lib/check-ban";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ slug: string }> };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const banUserSchema = z.object({
  handle: z.string().min(1).max(20),
  reason: z.string().max(1000).optional(),
});

const unbanUserSchema = z.object({
  handle: z.string().min(1).max(20),
});

// ---------------------------------------------------------------------------
// Auth helper: require WARDEN or OVERSEER for a hub
// ---------------------------------------------------------------------------

async function requireWardenOrOverseer(
  userId: string,
  userRole: string,
  hubId: string,
): Promise<NextResponse | null> {
  if (userRole === "OVERSEER") return null; // authorized

  const membership = await db.membership.findUnique({
    where: { userId_hubId: { userId, hubId } },
    select: { role: true },
  });

  if (!membership || membership.role !== "WARDEN") {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "You must be a Warden of this hub or an Overseer to manage bans.",
        },
      },
      { status: 403 },
    );
  }

  return null; // authorized
}

// ---------------------------------------------------------------------------
// GET /api/hubs/[slug]/bans
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

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

  const authError = await requireWardenOrOverseer(user.id, user.role ?? "MEMBER", hub.id);
  if (authError) return authError;

  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  try {
    const bans = await db.hubBan.findMany({
      where: { hubId: hub.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        user: { select: { handle: true, avatar: true, displayName: true } },
      },
    });

    const hasMore = bans.length > limit;
    const page = hasMore ? bans.slice(0, limit) : bans;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return NextResponse.json({ bans: page, nextCursor });
  } catch (err) {
    logger.error({ err, hubId: hub.id }, "bans: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve bans." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/hubs/[slug]/bans
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

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

  const authError = await requireWardenOrOverseer(user.id, user.role ?? "MEMBER", hub.id);
  if (authError) return authError;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = banUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid ban data.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { handle, reason } = parsed.data;

  // Resolve target user
  const target = await db.user.findUnique({
    where: { handle },
    select: { id: true, handle: true },
  });

  if (!target) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `User "${handle}" not found.` } },
      { status: 404 },
    );
  }

  // Prevent banning yourself
  if (target.id === user.id) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "You cannot ban yourself." } },
      { status: 422 },
    );
  }

  // Check for existing ban
  const existing = await db.hubBan.findUnique({
    where: { userId_hubId: { userId: target.id, hubId: hub.id } },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: `User "${handle}" is already banned from this hub.` } },
      { status: 409 },
    );
  }

  try {
    // Create ban + remove membership in a transaction
    const [ban] = await db.$transaction([
      db.hubBan.create({
        data: {
          userId: target.id,
          hubId: hub.id,
          bannedBy: user.id,
          reason: reason ?? null,
        },
      }),
      db.membership.deleteMany({
        where: { userId: target.id, hubId: hub.id },
      }),
    ]);

    // Invalidate ban cache for immediate effect
    await invalidateBanCache(target.id, hub.id);

    await logModAction({
      hubId: hub.id,
      moderatorId: user.id,
      action: ModActionType.BAN_USER,
      targetUserId: target.id,
      reason,
    });

    logger.info(
      { userId: user.id, targetUserId: target.id, hubId: hub.id },
      "bans: user banned",
    );

    return NextResponse.json({ ban }, { status: 201 });
  } catch (err) {
    logger.error({ err, userId: user.id, targetHandle: handle }, "bans: POST failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to ban user." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/hubs/[slug]/bans
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

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

  const authError = await requireWardenOrOverseer(user.id, user.role ?? "MEMBER", hub.id);
  if (authError) return authError;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = unbanUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid unban data.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { handle } = parsed.data;

  const target = await db.user.findUnique({
    where: { handle },
    select: { id: true },
  });

  if (!target) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `User "${handle}" not found.` } },
      { status: 404 },
    );
  }

  const ban = await db.hubBan.findUnique({
    where: { userId_hubId: { userId: target.id, hubId: hub.id } },
    select: { id: true },
  });

  if (!ban) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `User "${handle}" is not banned from this hub.` } },
      { status: 404 },
    );
  }

  try {
    await db.hubBan.delete({
      where: { userId_hubId: { userId: target.id, hubId: hub.id } },
    });

    await invalidateBanCache(target.id, hub.id);

    await logModAction({
      hubId: hub.id,
      moderatorId: user.id,
      action: ModActionType.UNBAN_USER,
      targetUserId: target.id,
    });

    logger.info(
      { userId: user.id, targetUserId: target.id, hubId: hub.id },
      "bans: user unbanned",
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, userId: user.id, targetHandle: handle }, "bans: DELETE failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to unban user." } },
      { status: 500 },
    );
  }
}
