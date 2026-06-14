/**
 * /api/admin/users/[handle]
 *
 * PATCH — Update a user's role or suspension status. OVERSEER only.
 *
 * Body (at least one field required):
 *   { role?: "MEMBER" | "OVERSEER", suspended?: boolean }
 *
 * PATCH responses:
 *   200 { user }
 *   400 invalid JSON
 *   401 unauthenticated
 *   403 not an Overseer
 *   404 user not found
 *   422 validation error
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireOverseer } from "@/lib/auth-helpers";
import { logModAction, ModActionType } from "@/lib/mod-log";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ handle: string }> };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const patchUserSchema = z
  .object({
    role: z.enum(["MEMBER", "OVERSEER"]).optional(),
    suspended: z.boolean().optional(),
  })
  .refine((data) => data.role !== undefined || data.suspended !== undefined, {
    message: "At least one of role or suspended must be provided.",
  });

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/[handle]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { handle } = await context.params;

  const userOrResponse = await requireOverseer();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const overseer = userOrResponse;

  const target = await db.user.findUnique({
    where: { handle },
    select: { id: true, handle: true, role: true, suspended: true },
  });

  if (!target) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `User "${handle}" not found.` } },
      { status: 404 },
    );
  }

  // Prevent an Overseer from demoting themselves
  if (target.id === overseer.id) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "You cannot modify your own account via this endpoint." } },
      { status: 422 },
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

  const parsed = patchUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid user update data.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { role, suspended } = parsed.data;

  try {
    const updated = await db.user.update({
      where: { id: target.id },
      data: {
        ...(role !== undefined ? { role } : {}),
        ...(suspended !== undefined ? { suspended } : {}),
      },
      select: {
        id: true,
        handle: true,
        email: true,
        displayName: true,
        role: true,
        suspended: true,
        clout: true,
        createdAt: true,
      },
    });

    // Log the action — use BAN_USER / UNBAN_USER for suspension, no dedicated type needed
    if (suspended !== undefined) {
      await logModAction({
        moderatorId: overseer.id,
        action: suspended ? ModActionType.BAN_USER : ModActionType.UNBAN_USER,
        targetUserId: target.id,
        reason: `Account ${suspended ? "suspended" : "unsuspended"} by Overseer`,
      });
    }

    logger.info(
      { overseerUserId: overseer.id, targetUserId: target.id, role, suspended },
      "admin/users: user updated",
    );

    return NextResponse.json({ user: updated });
  } catch (err) {
    logger.error({ err, targetHandle: handle }, "admin/users: PATCH failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update user." } },
      { status: 500 },
    );
  }
}
