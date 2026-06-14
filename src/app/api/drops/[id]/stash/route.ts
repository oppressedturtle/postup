/**
 * /api/drops/[id]/stash
 *
 * POST   — Save a drop to the authenticated user's Stash (idempotent).
 * DELETE — Remove a drop from the authenticated user's Stash.
 *
 * Both require authentication. Both are idempotent — already-stashed / not-stashed
 * states are handled gracefully without errors.
 *
 * Responses:
 *   POST:
 *     200  { stashed: true }
 *     401  unauthenticated
 *     404  drop not found
 *     500  internal error
 *
 *   DELETE:
 *     200  { stashed: false }
 *     401  unauthenticated
 *     500  internal error
 */
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/drops/[id]/stash — save to stash
// ---------------------------------------------------------------------------

export async function POST(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const { id: dropId } = await context.params;

  // Verify drop exists and is not removed
  const drop = await db.drop.findUnique({
    where: { id: dropId },
    select: { id: true, isRemoved: true },
  });

  if (!drop || drop.isRemoved) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Drop not found." } },
      { status: 404 },
    );
  }

  try {
    // Upsert — idempotent: already stashed is a no-op
    await db.stash.upsert({
      where: { userId_dropId: { userId: user.id, dropId } },
      create: { userId: user.id, dropId },
      update: {}, // already stashed, nothing to change
    });

    logger.info({ userId: user.id, dropId }, "stash: saved");

    return NextResponse.json({ stashed: true });
  } catch (err) {
    logger.error({ err, userId: user.id, dropId }, "stash: POST failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to save to stash." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/drops/[id]/stash — remove from stash
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const { id: dropId } = await context.params;

  try {
    // deleteMany is idempotent — no error if record does not exist
    await db.stash.deleteMany({
      where: { userId: user.id, dropId },
    });

    logger.info({ userId: user.id, dropId }, "stash: removed");

    return NextResponse.json({ stashed: false });
  } catch (err) {
    logger.error({ err, userId: user.id, dropId }, "stash: DELETE failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to remove from stash." } },
      { status: 500 },
    );
  }
}
