/**
 * /api/admin/users
 *
 * GET — Search and list users. OVERSEER only.
 *
 * Query params:
 *   q?       — search by handle or email (partial match, case-insensitive)
 *   role?    — filter by role: MEMBER | OVERSEER
 *   cursor?  — pagination cursor (last User id)
 *   limit?   — 1–50 (default 20)
 *
 * GET responses:
 *   200 { users, nextCursor }
 *   401 unauthenticated
 *   403 not an Overseer
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireOverseer } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const getUsersSchema = z.object({
  q: z.string().optional(),
  role: z.enum(["MEMBER", "OVERSEER"]).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/admin/users
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userOrResponse = await requireOverseer();
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  const parsed = getUsersSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    role: searchParams.get("role") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { q, role } = parsed.data;

  try {
    type WhereClause = {
      role?: "MEMBER" | "OVERSEER";
      OR?: Array<
        | { handle: { contains: string; mode: "insensitive" } }
        | { email: { contains: string; mode: "insensitive" } }
      >;
    };

    const where: WhereClause = {};
    if (role) where.role = role;
    if (q) {
      where.OR = [
        { handle: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        handle: true,
        email: true,
        displayName: true,
        avatar: true,
        role: true,
        clout: true,
        suspended: true,
        createdAt: true,
        hubBans: { select: { id: true } },
      },
    });

    const hasMore = users.length > limit;
    const page = hasMore ? users.slice(0, limit) : users;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return NextResponse.json({ users: page, nextCursor });
  } catch (err) {
    logger.error({ err }, "admin/users: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve users." } },
      { status: 500 },
    );
  }
}
