/**
 * /api/reports/[id]
 *
 * PATCH — Resolve or dismiss a report.
 *
 * Caller must be a WARDEN of the relevant hub (for hub-scoped reports) or OVERSEER.
 *
 * Body: { action: "resolve" | "dismiss", reason?: string }
 *   resolve  — sets status=RESOLVED; also soft-removes the reported content
 *   dismiss  — sets status=DISMISSED; no content action
 *
 * PATCH responses:
 *   200 { report }
 *   400 invalid JSON
 *   401 unauthenticated
 *   403 forbidden
 *   404 report not found
 *   409 report already resolved/dismissed
 *   422 validation error
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireAuth } from "@/lib/auth-helpers";
import { logModAction, ModActionType } from "@/lib/mod-log";
import { Prisma } from "@/generated/prisma/client";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const resolveReportSchema = z.object({
  action: z.enum(["resolve", "dismiss"]),
  reason: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// PATCH /api/reports/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // --- Fetch report with content context ---
  const report = await db.report.findUnique({
    where: { id },
    include: {
      drop: {
        select: { id: true, hubId: true, isRemoved: true },
      },
      reply: {
        select: {
          id: true,
          dropId: true,
          isRemoved: true,
          drop: { select: { hubId: true } },
        },
      },
    },
  });

  if (!report) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Report not found." } },
      { status: 404 },
    );
  }

  if (report.status !== "PENDING") {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "This report has already been resolved or dismissed." } },
      { status: 409 },
    );
  }

  // --- Determine hub for authorization ---
  const hubId = report.drop?.hubId ?? report.reply?.drop?.hubId ?? null;

  const isOverseer = user.role === "OVERSEER";

  if (!isOverseer) {
    if (!hubId) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions to resolve this report." } },
        { status: 403 },
      );
    }

    const membership = await db.membership.findUnique({
      where: { userId_hubId: { userId: user.id, hubId } },
      select: { role: true },
    });

    if (!membership || membership.role !== "WARDEN") {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You must be a Warden of the relevant hub or an Overseer to resolve reports.",
          },
        },
        { status: 403 },
      );
    }
  }

  // --- Parse body ---
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = resolveReportSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid resolution data.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { action, reason } = parsed.data;
  const now = new Date();

  try {
    // If resolving, also soft-remove the reported content
    if (action === "resolve") {
      if (report.drop && !report.drop.isRemoved) {
        await db.drop.update({
          where: { id: report.drop.id },
          data: {
            isRemoved: true,
            body: null,
            imageUrl: null,
            videoUrl: null,
            linkUrl: null,
            linkPreview: Prisma.JsonNull,
          },
        });

        // Invalidate drop + feed caches
        try {
          await redis.del(`drop:${report.drop.id}`);
          const feedKeys = await redis.keys(`feed:*`);
          if (feedKeys.length > 0) await redis.del(...feedKeys);
        } catch {
          // Non-fatal
        }

        await logModAction({
          hubId: hubId ?? undefined,
          moderatorId: user.id,
          action: ModActionType.REMOVE_DROP,
          dropId: report.drop.id,
          reportId: id,
          reason,
        });
      }

      if (report.reply && !report.reply.isRemoved) {
        await db.reply.update({
          where: { id: report.reply.id },
          data: { isRemoved: true, body: "[removed]" },
        });

        // Invalidate reply caches
        try {
          const keys = [
            `reply:${report.reply.id}`,
            ...(await redis.keys(`replies:${report.reply.dropId}:*`)),
          ];
          if (keys.length > 0) await redis.del(...keys);
        } catch {
          // Non-fatal
        }

        await logModAction({
          hubId: hubId ?? undefined,
          moderatorId: user.id,
          action: ModActionType.REMOVE_REPLY,
          replyId: report.reply.id,
          reportId: id,
          reason,
        });
      }
    }

    // Update report status
    const updatedReport = await db.report.update({
      where: { id },
      data: {
        status: action === "resolve" ? "RESOLVED" : "DISMISSED",
        resolvedBy: user.id,
        resolvedAt: now,
      },
    });

    await logModAction({
      hubId: hubId ?? undefined,
      moderatorId: user.id,
      action: action === "resolve" ? ModActionType.RESOLVE_REPORT : ModActionType.DISMISS_REPORT,
      reportId: id,
      reason,
    });

    logger.info(
      { userId: user.id, reportId: id, action, hubId },
      "report: resolution applied",
    );

    return NextResponse.json({ report: updatedReport });
  } catch (err) {
    logger.error({ err, userId: user.id, reportId: id, action }, "report: PATCH failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to resolve report." } },
      { status: 500 },
    );
  }
}
