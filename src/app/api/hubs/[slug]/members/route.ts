/**
 * GET /api/hubs/[slug]/members
 *
 * List members of a hub with cursor-based pagination (max 50 per page).
 * Optionally filter by role (MEMBER | WARDEN).
 *
 * Query params:
 *   role    — filter by MembershipRole (optional)
 *   limit   — number of results (default 20, max 50)
 *   cursor  — membership id for cursor pagination
 *
 * Responses:
 *   200 { members: MemberEntry[], nextCursor: string | null }
 *   404 hub not found
 *   422 invalid query params
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import logger from "@/lib/logger";

type RouteContext = { params: Promise<{ slug: string }> };

const querySchema = z.object({
  role: z.enum(["MEMBER", "WARDEN"]).optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? parseInt(v, 10) : 20;
      return Math.min(Math.max(Number.isNaN(n) ? 20 : n, 1), 50);
    }),
  cursor: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;
  const { searchParams } = request.nextUrl;

  const queryParsed = querySchema.safeParse({
    role: searchParams.get("role") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  });

  if (!queryParsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters.",
          details: queryParsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { role, limit, cursor } = queryParsed.data;

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
    const memberships = await db.membership.findMany({
      where: {
        hubId: hub.id,
        ...(role ? { role } : {}),
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { joinedAt: "asc" },
      include: {
        user: {
          select: {
            handle: true,
            avatar: true,
            clout: true,
          },
        },
      },
    });

    const hasNextPage = memberships.length > limit;
    const page = hasNextPage ? memberships.slice(0, limit) : memberships;
    const nextCursor = hasNextPage
      ? (page[page.length - 1]?.id ?? null)
      : null;

    const members = page.map((m) => ({
      id: m.id,
      role: m.role,
      joinedAt: m.joinedAt,
      user: m.user,
    }));

    return NextResponse.json({ members, nextCursor });
  } catch (err) {
    logger.error({ err, slug }, "hub: member list failed");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to retrieve hub members.",
        },
      },
      { status: 500 },
    );
  }
}
