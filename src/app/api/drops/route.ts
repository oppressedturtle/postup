/**
 * /api/drops
 *
 * POST  — Create a new Drop (auth required, hub membership required).
 * GET   — Feed query: paginated list of Drops with sort options.
 *
 * POST body (JSON):
 *   { title, type, hubSlug, body?, imageUrl?, videoUrl?, linkUrl? }
 *
 * GET query params:
 *   hubSlug?  — filter to a single hub
 *   sort      — hot | rising | fresh | top  (default: hot)
 *   limit     — 1-50 (default: 20)
 *   cursor    — opaque cursor for pagination (drop ID)
 *
 * POST responses:
 *   201  { drop }
 *   400  invalid JSON body
 *   401  unauthenticated
 *   403  not a member of the hub
 *   404  hub not found
 *   422  validation error
 *   429  rate limited
 *   500  internal error
 *
 * GET responses:
 *   200  { drops, nextCursor }
 *   500  internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireAuth } from "@/lib/auth-helpers";
import { fetchLinkPreview } from "@/lib/link-preview";
import { rateLimit } from "@/lib/rate-limit";
import { isUserBanned } from "@/lib/check-ban";
import { hotScore, isRising } from "@/lib/ranking";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createDropSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TEXT"),
    title: z.string().min(1).max(300),
    hubSlug: z.string().min(1),
    body: z.string().max(40_000),
  }),
  z.object({
    type: z.literal("IMAGE"),
    title: z.string().min(1).max(300),
    hubSlug: z.string().min(1),
    imageUrl: z.string().url("imageUrl must be a valid URL"),
  }),
  z.object({
    type: z.literal("VIDEO"),
    title: z.string().min(1).max(300),
    hubSlug: z.string().min(1),
    videoUrl: z.string().url("videoUrl must be a valid URL"),
  }),
  z.object({
    type: z.literal("LINK"),
    title: z.string().min(1).max(300),
    hubSlug: z.string().min(1),
    linkUrl: z.string().url("linkUrl must be a valid URL"),
  }),
]);

const VALID_SORTS = ["hot", "rising", "fresh", "top"] as const;
type SortMode = (typeof VALID_SORTS)[number];

// ---------------------------------------------------------------------------
// Feed include shape (reused for POST return and GET list)
// ---------------------------------------------------------------------------

const dropInclude = {
  author: { select: { id: true, handle: true, displayName: true, avatar: true } },
  hub: { select: { id: true, slug: true, name: true, icon: true } },
  _count: { select: { replies: true, votes: true } },
} as const;

// ---------------------------------------------------------------------------
// POST /api/drops
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // Rate limit: 10 drops per hour per user
  const rl = await rateLimit(`drops:create:${user.id}`, 10, 60 * 60);
  if (!rl.success) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "You can only create 10 drops per hour." } },
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

  const parsed = createDropSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid drop data.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // Resolve hub
  const hub = await db.hub.findUnique({
    where: { slug: data.hubSlug },
    select: { id: true, slug: true },
  });

  if (!hub) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Hub "${data.hubSlug}" not found.` } },
      { status: 404 },
    );
  }

  // Membership check — user must be a member of the hub
  const membership = await db.membership.findUnique({
    where: { userId_hubId: { userId: user.id, hubId: hub.id } },
  });

  if (!membership) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "You must be a member of this hub to post.",
        },
      },
      { status: 403 },
    );
  }

  // Ban check: blocked users cannot post
  const banned = await isUserBanned(user.id, hub.id);
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

  // New-account rate control: accounts < 24 h old are limited to 2 drops/day
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const userRecord = await db.user.findUnique({
    where: { id: user.id },
    select: { createdAt: true },
  });

  if (userRecord && userRecord.createdAt > oneDayAgo) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const todayDropCount = await db.drop.count({
      where: {
        authorId: user.id,
        createdAt: { gte: startOfDay },
      },
    });

    if (todayDropCount >= 2) {
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

  // Fetch link preview for LINK drops
  let linkPreview: Awaited<ReturnType<typeof fetchLinkPreview>> = null;
  if (data.type === "LINK") {
    try {
      linkPreview = await fetchLinkPreview(data.linkUrl);
    } catch {
      // Non-fatal — preview can be re-fetched later
    }
  }

  // Create drop
  try {
    const drop = await db.drop.create({
      data: {
        title: data.title,
        type: data.type,
        hubId: hub.id,
        authorId: user.id,
        ...(data.type === "TEXT" ? { body: data.body } : {}),
        ...(data.type === "IMAGE" ? { imageUrl: data.imageUrl } : {}),
        ...(data.type === "VIDEO" ? { videoUrl: data.videoUrl } : {}),
        ...(data.type === "LINK"
          ? {
              linkUrl: data.linkUrl,
              linkPreview: linkPreview
                ? (linkPreview as unknown as Prisma.InputJsonValue)
                : undefined,
            }
          : {}),
      },
      include: dropInclude,
    });

    logger.info({ userId: user.id, dropId: drop.id, type: data.type }, "drop: created");

    // Invalidate feed caches for this hub and the global feed
    try {
      const hubKeys = await redis.keys(`feed:${hub.slug}:*`);
      const allKeys = await redis.keys(`feed:all:*`);
      const keysToDelete = [...hubKeys, ...allKeys];
      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
      }
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ drop }, { status: 201 });
  } catch (err) {
    logger.error({ err, userId: user.id }, "drop: POST failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create drop." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/drops
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const hubSlug = searchParams.get("hubSlug") ?? undefined;
  const sortParam = searchParams.get("sort") ?? "hot";
  const limitParam = searchParams.get("limit") ?? "20";
  const cursor = searchParams.get("cursor") ?? undefined;

  // Validate sort
  const sort: SortMode = (VALID_SORTS as readonly string[]).includes(sortParam)
    ? (sortParam as SortMode)
    : "hot";

  // Validate limit
  const limit = Math.min(50, Math.max(1, parseInt(limitParam, 10) || 20));

  const cacheKey = `feed:${hubSlug ?? "all"}:${sort}:${cursor ?? "start"}`;

  // Redis cache read
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), {
        headers: { "X-Cache": "HIT" },
      });
    }
  } catch {
    // Degrade gracefully
  }

  try {
    // Build where clause
    const where: Record<string, unknown> = { isRemoved: false };

    if (hubSlug) {
      const hub = await db.hub.findUnique({
        where: { slug: hubSlug },
        select: { id: true },
      });
      if (!hub) {
        return NextResponse.json({ drops: [], nextCursor: null });
      }
      where["hubId"] = hub.id;
    }

    // hot/rising: restrict DB query to last 72 h / 24 h to keep the candidate set small
    if (sort === "hot") {
      where["createdAt"] = { gt: new Date(Date.now() - 72 * 60 * 60 * 1000) };
    }
    if (sort === "rising") {
      where["createdAt"] = { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    }

    // Determine DB orderBy — application layer re-sorts for hot/rising
    type OrderByInput = { heat: "desc" } | { createdAt: "desc" };

    let orderBy: OrderByInput | OrderByInput[];
    switch (sort) {
      case "fresh":
        orderBy = { createdAt: "desc" };
        break;
      case "top":
        orderBy = { heat: "desc" };
        break;
      case "hot":
      case "rising":
      default:
        orderBy = [{ heat: "desc" }, { createdAt: "desc" }];
        break;
    }

    // For hot/rising we fetch a wider pool then re-sort in app layer for time decay
    const dbLimit = sort === "hot" || sort === "rising" ? (limit + 1) * 3 : limit + 1;

    const findArgs: Prisma.DropFindManyArgs = {
      where,
      orderBy,
      take: dbLimit,
      include: dropInclude,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    };

    const rawDrops = await db.drop.findMany(findArgs);

    let drops: typeof rawDrops;

    if (sort === "hot") {
      drops = rawDrops
        .map((d) => ({ drop: d, score: hotScore(d.heat, d.createdAt) }))
        .sort((a, b) => b.score - a.score)
        .map(({ drop }) => drop);
    } else if (sort === "rising") {
      drops = rawDrops
        .filter((d) => isRising(d.heat, d.createdAt))
        .map((d) => ({ drop: d, score: hotScore(d.heat, d.createdAt) }))
        .sort((a, b) => b.score - a.score)
        .map(({ drop }) => drop);
    } else {
      drops = rawDrops;
    }

    const hasMore = drops.length > limit;
    const page = hasMore ? drops.slice(0, limit) : drops;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    const payload = { drops: page, nextCursor };

    // Cache for 30 seconds
    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 30);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err, hubSlug, sort }, "drop: GET feed failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve feed." } },
      { status: 500 },
    );
  }
}
