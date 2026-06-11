/**
 * /api/hubs/[slug]
 *
 * GET    — Fetch hub by slug (public; includes caller membership if authed).
 * PATCH  — Update hub settings (WARDEN or OVERSEER only).
 * DELETE — Delete hub (OVERSEER only); cascade handled by Prisma.
 *
 * GET responses:
 *   200 { hub }
 *   404 hub not found
 *   500 internal error
 *
 * PATCH responses:
 *   200 { hub }
 *   400 invalid body
 *   401 not authenticated
 *   403 not a warden or overseer
 *   404 hub not found
 *   422 validation error
 *   500 internal error
 *
 * DELETE responses:
 *   204 (no body)
 *   401 not authenticated
 *   403 not an overseer
 *   404 hub not found
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import { requireAuth, requireOverseer } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const patchHubSchema = z.object({
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer.")
    .optional(),
  rules: z
    .string()
    .max(2000, "Rules must be 2000 characters or fewer.")
    .optional(),
  nsfw: z.boolean().optional(),
  icon: z.string().url("icon must be a valid URL.").optional(),
  banner: z.string().url("banner must be a valid URL.").optional(),
});

// ---------------------------------------------------------------------------
// Shared: resolve hub by slug
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ slug: string }> };

async function getHubBySlug(slug: string) {
  return db.hub.findUnique({
    where: { slug },
    include: {
      _count: { select: { memberships: true, drops: true } },
      creator: { select: { handle: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/hubs/[slug]
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;

  // Cache key — authenticated requests bypass the shared cache so they
  // receive their own membership field.
  const session = await auth();
  const userId = session?.user?.id;
  const cacheKey = userId
    ? `hub:${slug}:user:${userId}`
    : `hub:${slug}:public`;

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
    const hub = await getHubBySlug(slug);

    if (!hub) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: `Hub "${slug}" not found.` } },
        { status: 404 },
      );
    }

    // If authenticated, include caller's membership so the UI knows join status + role
    let membership = null;
    if (userId) {
      membership = await db.membership.findUnique({
        where: { userId_hubId: { userId, hubId: hub.id } },
      });
    }

    const payload = { hub, membership };

    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 30);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err, slug }, "hub: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve hub." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/hubs/[slug]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;

  // --- Auth: WARDEN or OVERSEER --------------------------------------------
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // Fetch hub first to get its ID for the warden check
  const hub = await db.hub.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });

  if (!hub) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Hub "${slug}" not found.` } },
      { status: 404 },
    );
  }

  // Allow if OVERSEER, else require WARDEN of this hub
  if (user.role !== "OVERSEER") {
    const membership = await db.membership.findUnique({
      where: { userId_hubId: { userId: user.id, hubId: hub.id } },
    });

    if (!membership || membership.role !== "WARDEN") {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message:
              "You must be a Warden of this hub or an Overseer to update it.",
          },
        },
        { status: 403 },
      );
    }
  }

  // --- Parse + validate body ------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = patchHubSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid hub update data.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { description, rules, nsfw, icon, banner } = parsed.data;

  // Reject empty PATCH
  if (Object.values(parsed.data).every((v) => v === undefined)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "At least one field must be provided for update.",
        },
      },
      { status: 422 },
    );
  }

  try {
    const updated = await db.hub.update({
      where: { id: hub.id },
      data: {
        ...(description !== undefined && { description }),
        ...(rules !== undefined && { rules }),
        ...(nsfw !== undefined && { nsfw }),
        ...(icon !== undefined && { icon }),
        ...(banner !== undefined && { banner }),
      },
      include: {
        _count: { select: { memberships: true, drops: true } },
        creator: { select: { handle: true } },
      },
    });

    // Invalidate cached hub responses
    try {
      const keys = await redis.keys(`hub:${slug}:*`);
      if (keys.length) await redis.del(...keys);
    } catch {
      // Non-fatal
    }

    logger.info({ userId: user.id, hubId: hub.id }, "hub: settings updated");

    return NextResponse.json({ hub: updated });
  } catch (err) {
    logger.error({ err, userId: user.id, hubId: hub.id }, "hub: PATCH failed");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update hub.",
        },
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/hubs/[slug]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;

  // --- OVERSEER only --------------------------------------------------------
  const userOrResponse = await requireOverseer();
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

  try {
    await db.hub.delete({ where: { id: hub.id } });

    // Evict all cached keys for this hub
    try {
      const keys = await redis.keys(`hub:${slug}:*`);
      if (keys.length) await redis.del(...keys);
    } catch {
      // Non-fatal
    }

    logger.info({ userId: user.id, hubId: hub.id, slug }, "hub: deleted");

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logger.error({ err, userId: user.id, hubId: hub.id }, "hub: DELETE failed");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to delete hub.",
        },
      },
      { status: 500 },
    );
  }
}
