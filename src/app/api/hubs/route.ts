/**
 * /api/hubs
 *
 * POST — Create a new hub (auth required, rate limited to 3/day per user).
 * GET  — List/discover hubs with search, sort, and cursor pagination.
 *
 * POST responses:
 *   201 { hub }
 *   400 invalid body
 *   401 not authenticated
 *   409 slug already taken
 *   422 validation error
 *   429 rate limited
 *   500 internal error
 *
 * GET responses:
 *   200 { hubs: Hub[], nextCursor: string | null }
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createHubSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-z0-9_]{1,30}$/,
      "Hub name must be 1–30 characters: lowercase letters, numbers, and underscores only.",
    ),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer."),
  rules: z
    .string()
    .max(2000, "Rules must be 2000 characters or fewer.")
    .optional(),
  nsfw: z.boolean().default(false),
});

const listHubsQuerySchema = z.object({
  q: z.string().optional(),
  sort: z.enum(["new", "popular"]).default("popular"),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? parseInt(v, 10) : 20;
      return Math.min(Math.max(Number.isNaN(n) ? 20 : n, 1), 50);
    }),
  cursor: z.string().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/hubs — create hub
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // --- Auth -------------------------------------------------------------------
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // --- Rate limit: 3 hub creations per day per user -------------------------
  const rl = await rateLimit(`hub_create:${user.id}`, 3, 24 * 60 * 60);
  if (!rl.success) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message:
            "You can create at most 3 hubs per day. Please try again later.",
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.reset),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rl.reset),
        },
      },
    );
  }

  // --- Parse body ------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  // --- Validate --------------------------------------------------------------
  const parsed = createHubSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid hub data.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { name, description, rules, nsfw } = parsed.data;
  const slug = name; // hub slug is always the same as name

  // --- Uniqueness check ------------------------------------------------------
  const existing = await db.hub.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      {
        error: {
          code: "SLUG_TAKEN",
          message: `A hub named "${name}" already exists. Please choose a different name.`,
        },
      },
      { status: 409 },
    );
  }

  // --- Create hub + warden membership in a transaction ----------------------
  try {
    const hub = await db.$transaction(async (tx) => {
      const created = await tx.hub.create({
        data: {
          name,
          slug,
          description,
          rules: rules ?? "",
          nsfw,
          createdById: user.id,
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          hubId: created.id,
          role: "WARDEN",
        },
      });

      return created;
    });

    logger.info(
      { userId: user.id, hubId: hub.id, slug: hub.slug },
      "hub: created",
    );

    return NextResponse.json({ hub }, { status: 201 });
  } catch (err) {
    logger.error({ err, userId: user.id, slug }, "hub: creation failed");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Hub creation failed due to an internal error.",
        },
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/hubs — list / discover hubs
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  const queryParsed = listHubsQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
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

  const { q, sort, limit, cursor } = queryParsed.data;

  // --- Cache key based on full query string ---------------------------------
  const cacheKey = `hubs:list:${searchParams.toString()}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), {
        headers: { "X-Cache": "HIT" },
      });
    }
  } catch {
    // Redis unavailable — degrade gracefully, continue to DB
  }

  try {
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

    const orderBy =
      sort === "popular"
        ? { memberships: { _count: "desc" as const } }
        : { createdAt: "desc" as const };

    // Fetch limit+1 to detect if there's a next page
    const hubs = await db.hub.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        _count: { select: { memberships: true } },
      },
    });

    const hasNextPage = hubs.length > limit;
    const page = hasNextPage ? hubs.slice(0, limit) : hubs;
    const nextCursor = hasNextPage ? (page[page.length - 1]?.id ?? null) : null;

    const payload = { hubs: page, nextCursor };

    // Cache for 60 seconds
    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 60);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err }, "hub: list query failed");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to retrieve hubs.",
        },
      },
      { status: 500 },
    );
  }
}
