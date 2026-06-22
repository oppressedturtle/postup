/**
 * Auth helper utilities for PostUp API route handlers.
 *
 * Centralises the repetitive auth/authorization checks so route handlers
 * stay focused on business logic. Each helper throws a NextResponse early
 * return when the check fails — callers use the returned value (session user
 * or membership) on success.
 *
 * Usage pattern:
 *   const userOrResponse = await requireAuth();
 *   if (userOrResponse instanceof NextResponse) return userOrResponse;
 *   const user = userOrResponse; // typed as Session["user"]
 */
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { MembershipModel as Membership } from "@/generated/prisma/models/Membership";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Discriminated union returned by all helpers: either the authorised value
// or a NextResponse (error) that the caller must return immediately.
type AuthResult<T> = T | NextResponse;

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

/**
 * Returns the session user if a valid session exists, otherwise returns a
 * 401 NextResponse.
 *
 * Callers pattern-match the return with `instanceof NextResponse`.
 */
export async function requireAuth(): Promise<AuthResult<Session["user"]>> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHENTICATED",
          message: "You must be signed in to perform this action.",
        },
      },
      { status: 401 },
    );
  }

  // Secondary suspended check at the API layer — defence in depth alongside
  // the session callback check. Catches edge cases where a stale session token
  // is replayed before the session callback has had a chance to destroy it.
  const dbUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { suspended: true },
  });

  if (!dbUser || dbUser.suspended) {
    return NextResponse.json(
      {
        error: {
          code: "SUSPENDED",
          message: "Your account has been suspended.",
        },
      },
      { status: 403 },
    );
  }

  return session.user;
}

// ---------------------------------------------------------------------------
// requireOverseer
// ---------------------------------------------------------------------------

/**
 * Returns the session user if the caller has the OVERSEER site-level role,
 * otherwise returns a 403 NextResponse.
 *
 * Checks both session existence (401) and role (403).
 */
export async function requireOverseer(): Promise<AuthResult<Session["user"]>> {
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  if (userOrResponse.role !== "OVERSEER") {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "You must be an Overseer to perform this action.",
        },
      },
      { status: 403 },
    );
  }

  return userOrResponse;
}

// ---------------------------------------------------------------------------
// requireWarden
// ---------------------------------------------------------------------------

/**
 * Returns the caller's Membership record for the given hub if they are a
 * WARDEN of that hub, otherwise returns a 403 NextResponse.
 *
 * Also handles 401 (no session) before checking the membership.
 *
 * @param hubId  The primary-key ID of the hub being accessed.
 */
export async function requireWarden(
  hubId: string,
): Promise<AuthResult<Membership>> {
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  const membership = await db.membership.findUnique({
    where: {
      userId_hubId: { userId: userOrResponse.id, hubId },
    },
  });

  if (!membership || membership.role !== "WARDEN") {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message:
            "You must be a Warden of this hub to perform this action.",
        },
      },
      { status: 403 },
    );
  }

  return membership;
}
