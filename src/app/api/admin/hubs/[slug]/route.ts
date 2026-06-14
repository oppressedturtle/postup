/**
 * /api/admin/hubs/[slug]
 *
 * DELETE — Hard-delete a hub. OVERSEER only. Requires a confirmation reason.
 *
 * Body: { reason: string }
 *
 * DELETE responses:
 *   204 (no body)
 *   400 invalid JSON or missing reason
 *   401 unauthenticated
 *   403 not an Overseer
 *   404 hub not found
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireOverseer } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ slug: string }> };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const deleteHubSchema = z.object({
  reason: z.string().min(1, "A reason is required for hub deletion.").max(1000),
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/hubs/[slug]
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;

  const userOrResponse = await requireOverseer();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const overseer = userOrResponse;

  const hub = await db.hub.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });

  if (!hub) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Hub "${slug}" not found.` } },
      { status: 404 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = deleteHubSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "A deletion reason is required.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  try {
    await db.hub.delete({ where: { id: hub.id } });

    // Evict cached hub responses
    try {
      const keys = await redis.keys(`hub:${slug}:*`);
      if (keys.length) await redis.del(...keys);
      const feedKeys = await redis.keys(`feed:${slug}:*`);
      if (feedKeys.length) await redis.del(...feedKeys);
    } catch {
      // Non-fatal
    }

    logger.info(
      { overseerUserId: overseer.id, hubId: hub.id, slug, reason: parsed.data.reason },
      "admin/hubs: hub hard-deleted",
    );

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logger.error({ err, overseerUserId: overseer.id, hubId: hub.id }, "admin/hubs: DELETE failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete hub." } },
      { status: 500 },
    );
  }
}
