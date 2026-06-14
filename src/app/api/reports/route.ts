/**
 * /api/reports
 *
 * POST — Submit a content report (auth required).
 * GET  — List pending reports.
 *        WARDEN (scoped to hubSlug query param) or OVERSEER (all reports).
 *
 * POST body:
 *   { dropId? | replyId?, reason: ReportReason, details?: string (max 500) }
 *   Exactly one of dropId / replyId must be provided.
 *
 * GET query params:
 *   hubSlug?  — required for WARDENs; narrows results to that hub
 *   cursor?   — pagination cursor (last Report id)
 *   limit?    — 1–20 (default 20)
 *
 * Responses:
 *   POST  201 { report }
 *         401/422/429/409/500
 *   GET   200 { reports, nextCursor }
 *         401/403/500
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { ReportReason } from "@/generated/prisma/client";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const postReportSchema = z
  .object({
    dropId: z.string().optional(),
    replyId: z.string().optional(),
    reason: z.nativeEnum(ReportReason),
    details: z.string().max(500).optional(),
  })
  .refine((data) => Boolean(data.dropId) !== Boolean(data.replyId), {
    message: "Exactly one of dropId or replyId must be provided.",
  });

// ---------------------------------------------------------------------------
// POST /api/reports
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // Rate limit: 10 reports per hour per user
  const rl = await rateLimit(`reports:${user.id}`, 10, 3600);
  if (!rl.success) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "You are submitting reports too quickly. Please wait before trying again.",
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.reset - Math.floor(Date.now() / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      },
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

  const parsed = postReportSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid report data.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { dropId, replyId, reason, details } = parsed.data;

  // Verify the reported content actually exists
  if (dropId) {
    const drop = await db.drop.findUnique({ where: { id: dropId }, select: { id: true } });
    if (!drop) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Drop not found." } },
        { status: 404 },
      );
    }
  } else if (replyId) {
    const reply = await db.reply.findUnique({ where: { id: replyId }, select: { id: true } });
    if (!reply) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Reply not found." } },
        { status: 404 },
      );
    }
  }

  // Prevent duplicate reports
  const existingReport = await db.report.findFirst({
    where: {
      reporterId: user.id,
      ...(dropId ? { dropId } : { replyId }),
    },
    select: { id: true },
  });

  if (existingReport) {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "You have already reported this content." } },
      { status: 409 },
    );
  }

  try {
    const report = await db.report.create({
      data: {
        reporterId: user.id,
        dropId: dropId ?? null,
        replyId: replyId ?? null,
        reason,
        details: details ?? null,
      },
    });

    logger.info(
      { userId: user.id, reportId: report.id, dropId, replyId, reason },
      "report: created",
    );

    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    logger.error({ err, userId: user.id }, "report: POST failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to submit report." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/reports
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const { searchParams } = request.nextUrl;
  const hubSlug = searchParams.get("hubSlug") ?? undefined;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  const isOverseer = user.role === "OVERSEER";

  // WARDENs must provide hubSlug; OVERSEERs may omit it for site-wide view
  if (!isOverseer) {
    if (!hubSlug) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Wardens must provide a hubSlug query parameter.",
          },
        },
        { status: 403 },
      );
    }

    // Verify WARDEN status
    const hub = await db.hub.findUnique({ where: { slug: hubSlug }, select: { id: true } });
    if (!hub) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: `Hub "${hubSlug}" not found.` } },
        { status: 404 },
      );
    }

    const membership = await db.membership.findUnique({
      where: { userId_hubId: { userId: user.id, hubId: hub.id } },
      select: { role: true },
    });

    if (!membership || membership.role !== "WARDEN") {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You must be a Warden of this hub or an Overseer to view reports.",
          },
        },
        { status: 403 },
      );
    }
  }

  try {
    // Build where clause
    type WhereClause = {
      status: "PENDING";
      drop?: { hubId: string };
      OR?: Array<{ drop: { hubId: string } } | { reply: { drop: { hubId: string } } }>;
    };

    let where: WhereClause = { status: "PENDING" };

    if (hubSlug) {
      const hub = await db.hub.findUnique({ where: { slug: hubSlug }, select: { id: true } });
      if (hub) {
        // Hub-scoped: reports on drops in this hub OR replies in drops in this hub
        where = {
          status: "PENDING",
          OR: [
            { drop: { hubId: hub.id } },
            { reply: { drop: { hubId: hub.id } } },
          ],
        };
      }
    }

    const reports = await db.report.findMany({
      where,
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
          },
        },
        reply: {
          select: {
            id: true,
            body: true,
            isRemoved: true,
          },
        },
      },
    });

    const hasMore = reports.length > limit;
    const page = hasMore ? reports.slice(0, limit) : reports;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return NextResponse.json({ reports: page, nextCursor });
  } catch (err) {
    logger.error({ err, userId: user.id, hubSlug }, "report: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve reports." } },
      { status: 500 },
    );
  }
}
