/**
 * /api/hubs/[slug]/membership
 *
 * POST   — Join a hub (auth required; user must not already be a member).
 * DELETE — Leave a hub (auth required; must be a member; WARDEN cannot leave
 *          if they are the only WARDEN — transfer or delete the hub first).
 *
 * POST responses:
 *   201 { membership }
 *   400 already a member
 *   401 not authenticated
 *   404 hub not found
 *   500 internal error
 *
 * DELETE responses:
 *   204 (no body)
 *   400 not a member / sole warden restriction
 *   401 not authenticated
 *   404 hub not found
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

type RouteContext = { params: Promise<{ slug: string }> };

// ---------------------------------------------------------------------------
// POST /api/hubs/[slug]/membership — join
// ---------------------------------------------------------------------------

export async function POST(
  _request: NextRequest,
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

  // Check if already a member
  const existing = await db.membership.findUnique({
    where: { userId_hubId: { userId: user.id, hubId: hub.id } },
  });

  if (existing) {
    return NextResponse.json(
      {
        error: {
          code: "ALREADY_MEMBER",
          message: "You are already a member of this hub.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const membership = await db.membership.create({
      data: {
        userId: user.id,
        hubId: hub.id,
        role: "MEMBER",
      },
    });

    logger.info({ userId: user.id, hubId: hub.id }, "hub: user joined");

    return NextResponse.json({ membership }, { status: 201 });
  } catch (err) {
    logger.error({ err, userId: user.id, hubId: hub.id }, "hub: join failed");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to join hub.",
        },
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/hubs/[slug]/membership — leave
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
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

  const membership = await db.membership.findUnique({
    where: { userId_hubId: { userId: user.id, hubId: hub.id } },
  });

  if (!membership) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_MEMBER",
          message: "You are not a member of this hub.",
        },
      },
      { status: 400 },
    );
  }

  // A WARDEN cannot leave if they would be the last one — the hub would be
  // left without any moderation. They must transfer wardenhood or delete the hub.
  if (membership.role === "WARDEN") {
    const wardenCount = await db.membership.count({
      where: { hubId: hub.id, role: "WARDEN" },
    });

    if (wardenCount <= 1) {
      return NextResponse.json(
        {
          error: {
            code: "SOLE_WARDEN",
            message:
              "You are the only Warden. Promote another member to Warden or delete the hub before leaving.",
          },
        },
        { status: 400 },
      );
    }
  }

  try {
    await db.membership.delete({
      where: { userId_hubId: { userId: user.id, hubId: hub.id } },
    });

    logger.info({ userId: user.id, hubId: hub.id }, "hub: user left");

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logger.error({ err, userId: user.id, hubId: hub.id }, "hub: leave failed");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to leave hub.",
        },
      },
      { status: 500 },
    );
  }
}
