/**
 * /api/drops/[id]/replies
 *
 * GET  — Fetch all replies for a drop, flat list (client builds tree). Public.
 * POST — Create a new reply (auth + hub membership required).
 *
 * GET responses:
 *   200  { replies }
 *   404  drop not found
 *   500  internal error
 *
 * POST responses:
 *   201  { reply }
 *   400  invalid JSON
 *   401  unauthenticated
 *   403  not a member of this hub / drop is locked
 *   404  drop not found / parentId not found in this drop
 *   422  validation error
 *   429  rate limited (30 replies/hour per user)
 *   500  internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireAuth } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { isUserBanned } from "@/lib/check-ban";
import { extractMentions } from "@/lib/mentions";
import { createNotification, notifyMentions, NotificationType } from "@/lib/notifications";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const postReplySchema = z.object({
  body: z.string().min(1).max(10_000),
  parentId: z.string().optional(),
});

const getRepliesSchema = z.object({
  sort: z.enum(["best", "top", "new", "controversial"]).default("best"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

// ---------------------------------------------------------------------------
// Shared reply select shape
// ---------------------------------------------------------------------------

const replySelect = {
  id: true,
  body: true,
  authorId: true,
  dropId: true,
  parentId: true,
  heat: true,
  isRemoved: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: { id: true, handle: true, displayName: true, avatar: true },
  },
  _count: { select: { children: true } },
} as const;

// ---------------------------------------------------------------------------
// GET /api/drops/[id]/replies
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const { searchParams } = new URL(request.url);
  const parsed = getRepliesSchema.safeParse({
    sort: searchParams.get("sort") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
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

  const { sort, limit } = parsed.data;
  const cacheKey = `replies:${id}:${sort}:${limit}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), {
        headers: { "X-Cache": "HIT" },
      });
    }
  } catch {
    // Degrade gracefully on Redis failure
  }

  // Verify drop exists
  try {
    const drop = await db.drop.findUnique({
      where: { id },
      select: { id: true, isRemoved: true },
    });

    if (!drop || drop.isRemoved) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Drop not found." } },
        { status: 404 },
      );
    }
  } catch (err) {
    logger.error({ err, dropId: id }, "replies: GET drop check failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve replies." } },
      { status: 500 },
    );
  }

  try {
    let replies;

    if (sort === "controversial") {
      // Raw SQL for ABS(heat) DESC — Prisma doesn't expose ABS in orderBy.
      // We join the author and pull the _count.children via a separate query.
      const raw = await db.$queryRaw<
        Array<{
          id: string;
          body: string;
          authorId: string;
          dropId: string;
          parentId: string | null;
          heat: number;
          isRemoved: boolean;
          createdAt: Date;
          updatedAt: Date;
        }>
      >`
        SELECT id, body, "authorId", "dropId", "parentId", heat, "isRemoved", "createdAt", "updatedAt"
        FROM "Reply"
        WHERE "dropId" = ${id}
        ORDER BY ABS(heat) DESC, "createdAt" ASC
        LIMIT ${limit}
      `;

      // Enrich with author + child count via a second query
      const replyIds = raw.map((r) => r.id);
      const [authors, childCounts] = await Promise.all([
        db.user.findMany({
          where: { id: { in: raw.map((r) => r.authorId) } },
          select: { id: true, handle: true, displayName: true, avatar: true },
        }),
        db.reply.groupBy({
          by: ["parentId"],
          where: { parentId: { in: replyIds } },
          _count: { id: true },
        }),
      ]);

      const authorMap = new Map(authors.map((a) => [a.id, a]));
      const childCountMap = new Map(
        childCounts.map((c) => [c.parentId, c._count.id]),
      );

      replies = raw.map((r) => ({
        ...r,
        author: authorMap.get(r.authorId) ?? null,
        _count: { children: childCountMap.get(r.id) ?? 0 },
      }));
    } else {
      const orderBy =
        sort === "best"
          ? [{ heat: "desc" as const }, { createdAt: "asc" as const }]
          : sort === "top"
            ? [{ heat: "desc" as const }]
            : [{ createdAt: "desc" as const }]; // "new"

      replies = await db.reply.findMany({
        where: { dropId: id },
        orderBy,
        take: limit,
        select: replySelect,
      });
    }

    const payload = { replies };

    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 30);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err, dropId: id }, "replies: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve replies." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/drops/[id]/replies
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id: dropId } = await context.params;

  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // Rate limit: 30 replies/hour per user
  const rl = await rateLimit(`replies:${user.id}`, 30, 3600);
  if (!rl.success) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "You are posting replies too fast. Please wait before trying again.",
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

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = postReplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid reply data.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { body: replyBody, parentId } = parsed.data;

  // Fetch drop and verify membership
  const drop = await db.drop.findUnique({
    where: { id: dropId },
    select: {
      id: true,
      hubId: true,
      authorId: true,
      isRemoved: true,
      isLocked: true,
    },
  });

  if (!drop || drop.isRemoved) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Drop not found." } },
      { status: 404 },
    );
  }

  if (drop.isLocked) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "This drop is locked and no longer accepts replies." } },
      { status: 403 },
    );
  }

  // Verify membership in the hub
  const membership = await db.membership.findUnique({
    where: { userId_hubId: { userId: user.id, hubId: drop.hubId } },
    select: { id: true },
  });

  if (!membership) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "You must be a member of this hub to reply.",
        },
      },
      { status: 403 },
    );
  }

  // Ban check: blocked users cannot reply
  const banned = await isUserBanned(user.id, drop.hubId);
  if (banned) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "You are banned from this hub.",
        },
      },
      { status: 403 },
    );
  }

  // New-account rate control: accounts < 24 h old are limited to 5 replies/day
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const userRecord = await db.user.findUnique({
    where: { id: user.id },
    select: { createdAt: true },
  });

  if (userRecord && userRecord.createdAt > oneDayAgo) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const todayReplyCount = await db.reply.count({
      where: {
        authorId: user.id,
        createdAt: { gte: startOfDay },
      },
    });

    if (todayReplyCount >= 5) {
      return NextResponse.json(
        {
          error: {
            code: "NEW_ACCOUNT_LIMIT",
            message: "New accounts are limited for the first 24 hours.",
          },
        },
        { status: 403 },
      );
    }
  }

  // Validate parentId belongs to this drop if provided
  let parentAuthorId: string | null = null;
  if (parentId) {
    const parent = await db.reply.findUnique({
      where: { id: parentId },
      select: { id: true, dropId: true, authorId: true, isRemoved: true },
    });

    if (!parent || parent.dropId !== dropId) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Parent reply not found in this drop.",
          },
        },
        { status: 404 },
      );
    }

    parentAuthorId = parent.authorId;
  }

  try {
    const reply = await db.reply.create({
      data: {
        body: replyBody,
        authorId: user.id,
        dropId,
        ...(parentId ? { parentId } : {}),
      },
      select: replySelect,
    });

    // Invalidate reply list cache for this drop (all sort variants)
    try {
      const keys = await redis.keys(`replies:${dropId}:*`);
      if (keys.length > 0) await redis.del(...keys);
    } catch {
      // Non-fatal
    }

    // Extract @mentions from the body and send notifications
    const handles = extractMentions(replyBody);
    const notifPayload = { dropId, replyId: reply.id };

    // Fire notifications asynchronously — never block the response
    Promise.resolve().then(async () => {
      // 1. Notify mentioned users
      if (handles.length > 0) {
        await notifyMentions(user.id, user.handle ?? "", handles, notifPayload);
      }

      // 2. Notify drop author on top-level reply (skip self)
      if (!parentId && drop.authorId !== user.id) {
        await createNotification(drop.authorId, NotificationType.REPLY_TO_DROP, {
          replierHandle: user.handle,
          dropId,
          replyId: reply.id,
        });
      }

      // 3. Notify parent reply author on nested reply (skip self)
      if (parentId && parentAuthorId && parentAuthorId !== user.id) {
        await createNotification(
          parentAuthorId,
          NotificationType.REPLY_TO_REPLY,
          {
            replierHandle: user.handle,
            dropId,
            replyId: reply.id,
            parentReplyId: parentId,
          },
        );
      }
    }).catch((err: unknown) => {
      logger.error({ err, replyId: reply.id }, "replies: notification dispatch failed");
    });

    logger.info(
      { userId: user.id, dropId, replyId: reply.id, parentId },
      "replies: POST created",
    );

    return NextResponse.json({ reply }, { status: 201 });
  } catch (err) {
    logger.error({ err, userId: user.id, dropId }, "replies: POST failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create reply." } },
      { status: 500 },
    );
  }
}
