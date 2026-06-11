/**
 * /api/hubs/[slug]/wardens
 *
 * POST   — Promote an existing member to WARDEN (OVERSEER or existing WARDEN only).
 * DELETE — Demote a WARDEN to MEMBER (OVERSEER or existing WARDEN only).
 *          Cannot demote the hub creator.
 *
 * Both endpoints accept `{ handle: string }` in the request body.
 *
 * POST responses:
 *   200 { membership }
 *   400 not a member / already a warden
 *   401 not authenticated
 *   403 not warden or overseer
 *   404 hub or user not found
 *   500 internal error
 *
 * DELETE responses:
 *   200 { membership }
 *   400 not a member / not a warden / cannot demote creator
 *   401 not authenticated
 *   403 not warden or overseer
 *   404 hub or user not found
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

type RouteContext = { params: Promise<{ slug: string }> };

const bodySchema = z.object({
  handle: z.string().min(1, "handle is required."),
});

// ---------------------------------------------------------------------------
// Shared: resolve hub + caller authorization (WARDEN or OVERSEER)
// ---------------------------------------------------------------------------

async function resolveHubAndAuthorize(slug: string, callerId: string, callerRole: string) {
  const hub = await db.hub.findUnique({
    where: { slug },
    select: { id: true, createdById: true },
  });

  if (!hub) return { hub: null, authorized: false };

  // OVERSEER has blanket access
  if (callerRole === "OVERSEER") {
    return { hub, authorized: true };
  }

  // Otherwise caller must be a WARDEN of this hub
  const callerMembership = await db.membership.findUnique({
    where: { userId_hubId: { userId: callerId, hubId: hub.id } },
    select: { role: true },
  });

  return {
    hub,
    authorized: callerMembership?.role === "WARDEN",
  };
}

// ---------------------------------------------------------------------------
// POST /api/hubs/[slug]/wardens — promote member to WARDEN
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const caller = userOrResponse;

  const { hub, authorized } = await resolveHubAndAuthorize(slug, caller.id, caller.role);

  if (!hub) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Hub "${slug}" not found.` } },
      { status: 404 },
    );
  }

  if (!authorized) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "You must be a Warden of this hub or an Overseer.",
        },
      },
      { status: 403 },
    );
  }

  // --- Parse body -----------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { handle } = parsed.data;

  // Resolve target user
  const targetUser = await db.user.findUnique({
    where: { handle },
    select: { id: true },
  });

  if (!targetUser) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: `User "${handle}" not found.`,
        },
      },
      { status: 404 },
    );
  }

  // Target must already be a member
  const membership = await db.membership.findUnique({
    where: { userId_hubId: { userId: targetUser.id, hubId: hub.id } },
  });

  if (!membership) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_MEMBER",
          message: `User "${handle}" is not a member of this hub.`,
        },
      },
      { status: 400 },
    );
  }

  if (membership.role === "WARDEN") {
    return NextResponse.json(
      {
        error: {
          code: "ALREADY_WARDEN",
          message: `User "${handle}" is already a Warden of this hub.`,
        },
      },
      { status: 400 },
    );
  }

  try {
    const updated = await db.membership.update({
      where: { id: membership.id },
      data: { role: "WARDEN" },
    });

    logger.info(
      { callerId: caller.id, targetUserId: targetUser.id, hubId: hub.id },
      "hub: member promoted to warden",
    );

    return NextResponse.json({ membership: updated });
  } catch (err) {
    logger.error({ err, hubId: hub.id }, "hub: promote warden failed");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to promote member to Warden.",
        },
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/hubs/[slug]/wardens — demote WARDEN to MEMBER
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const caller = userOrResponse;

  const { hub, authorized } = await resolveHubAndAuthorize(slug, caller.id, caller.role);

  if (!hub) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Hub "${slug}" not found.` } },
      { status: 404 },
    );
  }

  if (!authorized) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "You must be a Warden of this hub or an Overseer.",
        },
      },
      { status: 403 },
    );
  }

  // --- Parse body -----------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { handle } = parsed.data;

  // Resolve target user
  const targetUser = await db.user.findUnique({
    where: { handle },
    select: { id: true },
  });

  if (!targetUser) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: `User "${handle}" not found.`,
        },
      },
      { status: 404 },
    );
  }

  // Cannot demote the hub creator
  if (targetUser.id === hub.createdById) {
    return NextResponse.json(
      {
        error: {
          code: "CANNOT_DEMOTE_CREATOR",
          message: "The hub creator cannot be demoted.",
        },
      },
      { status: 400 },
    );
  }

  const membership = await db.membership.findUnique({
    where: { userId_hubId: { userId: targetUser.id, hubId: hub.id } },
  });

  if (!membership) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_MEMBER",
          message: `User "${handle}" is not a member of this hub.`,
        },
      },
      { status: 400 },
    );
  }

  if (membership.role !== "WARDEN") {
    return NextResponse.json(
      {
        error: {
          code: "NOT_WARDEN",
          message: `User "${handle}" is not a Warden of this hub.`,
        },
      },
      { status: 400 },
    );
  }

  try {
    const updated = await db.membership.update({
      where: { id: membership.id },
      data: { role: "MEMBER" },
    });

    logger.info(
      { callerId: caller.id, targetUserId: targetUser.id, hubId: hub.id },
      "hub: warden demoted to member",
    );

    return NextResponse.json({ membership: updated });
  } catch (err) {
    logger.error({ err, hubId: hub.id }, "hub: demote warden failed");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to demote Warden.",
        },
      },
      { status: 500 },
    );
  }
}
