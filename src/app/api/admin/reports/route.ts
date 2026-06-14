/**
 * /api/admin/reports
 *
 * GET — All pending reports across all hubs. OVERSEER only.
 *
 * Query params:
 *   cursor?  — pagination cursor (last Report id)
 *   limit?   — 1–50 (default 20)
 *   status?  — PENDING | RESOLVED | DISMISSED (default: PENDING)
 *
 * GET responses:
 *   200 { reports, nextCursor }
 *   401 unauthenticated
 *   403 not an Overseer
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireOverseer } from "@/lib/auth-helpers";
import { ReportStatus } from "@/generated/prisma/client";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const getReportsSchema = z.object({
  status: z.nativeEnum(ReportStatus).optional().default(ReportStatus.PENDING),
});

// ---------------------------------------------------------------------------
// GET /api/admin/reports
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userOrResponse = await requireOverseer();
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  const parsed = getReportsSchema.safeParse({
    status: searchParams.get("status") ?? undefined,
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

  try {
    const reports = await db.report.findMany({
      where: { status: parsed.data.status },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        reporter: { select: { handle: true, avatar: true } },
        drop: {
          select: {
            id: true,
            title: true,
            body: true,
            isRemoved: true,
            hub: { select: { slug: true, name: true } },
          },
        },
        reply: {
          select: {
            id: true,
            body: true,
            isRemoved: true,
            drop: { select: { id: true, title: true, hub: { select: { slug: true, name: true } } } },
          },
        },
      },
    });

    const hasMore = reports.length > limit;
    const page = hasMore ? reports.slice(0, limit) : reports;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return NextResponse.json({ reports: page, nextCursor });
  } catch (err) {
    logger.error({ err }, "admin/reports: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve reports." } },
      { status: 500 },
    );
  }
}
