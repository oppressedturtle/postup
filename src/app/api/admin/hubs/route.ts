/**
 * /api/admin/hubs
 *
 * GET — List all hubs with member/drop counts. OVERSEER only.
 *
 * Query params:
 *   cursor?  — pagination cursor (last Hub id)
 *   limit?   — 1–50 (default 20)
 *   q?       — search by name/slug
 *
 * GET responses:
 *   200 { hubs, nextCursor }
 *   401 unauthenticated
 *   403 not an Overseer
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireOverseer } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// GET /api/admin/hubs
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userOrResponse = await requireOverseer();
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const q = searchParams.get("q") ?? undefined;

  try {
    type WhereClause = {
      OR?: Array<
        | { name: { contains: string; mode: "insensitive" } }
        | { slug: { contains: string; mode: "insensitive" } }
      >;
    };

    const where: WhereClause = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ];
    }

    const hubs = await db.hub.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        nsfw: true,
        createdAt: true,
        _count: {
          select: { memberships: true, drops: true },
        },
        creator: {
          select: { handle: true },
        },
      },
    });

    const hasMore = hubs.length > limit;
    const page = hasMore ? hubs.slice(0, limit) : hubs;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return NextResponse.json({ hubs: page, nextCursor });
  } catch (err) {
    logger.error({ err }, "admin/hubs: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve hubs." } },
      { status: 500 },
    );
  }
}
