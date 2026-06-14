/**
 * /api/search
 *
 * GET — Full-text search across drops, hubs, and users using Postgres FTS.
 *
 * Query params:
 *   q      — search query (required, min 2 chars)
 *   type   — drops | hubs | users | all  (default: all)
 *   limit  — results per type, 1–25 (default: 10)
 *   cursor — opaque cursor (not yet used for FTS, reserved for future offset pagination)
 *
 * Responses:
 *   200  { drops, hubs, users, nextCursor }
 *   400  missing/invalid query
 *   422  validation error
 *   429  rate limited
 *   500  internal error
 *
 * Security: parameterised raw queries only — no string interpolation.
 * Caching:  60s Redis cache keyed on (q, type, limit, cursor).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const searchQuerySchema = z.object({
  q: z
    .string()
    .min(2, "Search query must be at least 2 characters.")
    .max(200, "Search query must be 200 characters or fewer."),
  type: z.enum(["drops", "hubs", "users", "all"]).default("all"),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? parseInt(v, 10) : 10;
      return Math.min(25, Math.max(1, Number.isNaN(n) ? 10 : n));
    }),
  cursor: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Raw query result types
// ---------------------------------------------------------------------------

interface DropResult {
  id: string;
  title: string;
  body: string | null;
  type: string;
  heat: number;
  createdAt: Date;
  authorHandle: string;
  authorDisplayName: string;
  authorAvatar: string | null;
  hubSlug: string;
  hubName: string;
  hubIcon: string | null;
  replyCount: bigint;
}

interface HubResult {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  memberCount: bigint;
  dropCount: bigint;
}

interface UserResult {
  id: string;
  handle: string;
  displayName: string;
  avatar: string | null;
  clout: number;
}

// ---------------------------------------------------------------------------
// GET /api/search
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Rate limit: 30 searches/min per IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const rl = await rateLimit(`search:${ip}`, 30, 60);
  if (!rl.success) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many search requests. Please slow down." } },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.reset - Math.floor(Date.now() / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const { searchParams } = request.nextUrl;

  const parsed = searchQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    // Surface the q validation error as a 400 (missing/too short query)
    if (fieldErrors.q) {
      return NextResponse.json(
        { error: { code: "INVALID_QUERY", message: fieldErrors.q[0] ?? "Invalid query." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid search parameters.", details: fieldErrors } },
      { status: 422 },
    );
  }

  const { q, type, limit, cursor } = parsed.data;

  // Cache key
  const cacheKey = `search:${type}:${limit}:${cursor ?? ""}:${q}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), {
        headers: { "X-Cache": "HIT" },
      });
    }
  } catch {
    // Non-fatal cache miss
  }

  try {
    const [drops, hubs, users] = await Promise.all([
      type === "drops" || type === "all" ? searchDrops(q, limit) : Promise.resolve([]),
      type === "hubs"  || type === "all" ? searchHubs(q, limit)  : Promise.resolve([]),
      type === "users" || type === "all" ? searchUsers(q, limit)  : Promise.resolve([]),
    ]);

    const payload = {
      drops: drops.map(serializeDrop),
      hubs: hubs.map(serializeHub),
      users,
      nextCursor: null,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 60);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err, q, type }, "search: query failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Search failed." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// FTS helpers
// ---------------------------------------------------------------------------

async function searchDrops(q: string, limit: number): Promise<DropResult[]> {
  return db.$queryRaw<DropResult[]>`
    SELECT
      d.id,
      d.title,
      d.body,
      d.type,
      d.heat,
      d."createdAt",
      u.handle        AS "authorHandle",
      u."displayName" AS "authorDisplayName",
      u.avatar        AS "authorAvatar",
      h.slug          AS "hubSlug",
      h.name          AS "hubName",
      h.icon          AS "hubIcon",
      COUNT(r.id)     AS "replyCount"
    FROM "Drop" d
    JOIN "User" u ON u.id = d."authorId"
    JOIN "Hub"  h ON h.id = d."hubId"
    LEFT JOIN "Reply" r ON r."dropId" = d.id AND r."isRemoved" = false
    WHERE
      d."isRemoved" = false
      AND to_tsvector('english', d.title || ' ' || COALESCE(d.body, ''))
          @@ plainto_tsquery('english', ${q})
    GROUP BY d.id, u.handle, u."displayName", u.avatar, h.slug, h.name, h.icon
    ORDER BY
      ts_rank(
        to_tsvector('english', d.title || ' ' || COALESCE(d.body, '')),
        plainto_tsquery('english', ${q})
      ) DESC,
      d.heat DESC
    LIMIT ${Prisma.raw(String(limit))}
  `;
}

async function searchHubs(q: string, limit: number): Promise<HubResult[]> {
  return db.$queryRaw<HubResult[]>`
    SELECT
      h.id,
      h.slug,
      h.name,
      h.description,
      h.icon,
      COUNT(DISTINCT m.id) AS "memberCount",
      COUNT(DISTINCT d.id) AS "dropCount"
    FROM "Hub" h
    LEFT JOIN "Membership" m ON m."hubId" = h.id
    LEFT JOIN "Drop" d ON d."hubId" = h.id AND d."isRemoved" = false
    WHERE
      to_tsvector('english', h.name || ' ' || h.description)
      @@ plainto_tsquery('english', ${q})
    GROUP BY h.id
    ORDER BY
      ts_rank(
        to_tsvector('english', h.name || ' ' || h.description),
        plainto_tsquery('english', ${q})
      ) DESC,
      COUNT(DISTINCT m.id) DESC
    LIMIT ${Prisma.raw(String(limit))}
  `;
}

async function searchUsers(q: string, limit: number): Promise<UserResult[]> {
  return db.$queryRaw<UserResult[]>`
    SELECT
      u.id,
      u.handle,
      u."displayName",
      u.avatar,
      u.clout
    FROM "User" u
    WHERE
      to_tsvector('simple', u.handle || ' ' || u."displayName")
      @@ plainto_tsquery('simple', ${q})
    ORDER BY
      ts_rank(
        to_tsvector('simple', u.handle || ' ' || u."displayName"),
        plainto_tsquery('simple', ${q})
      ) DESC,
      u.clout DESC
    LIMIT ${Prisma.raw(String(limit))}
  `;
}

// ---------------------------------------------------------------------------
// Serialisers — convert BigInt reply/member counts to numbers
// ---------------------------------------------------------------------------

function serializeDrop(d: DropResult) {
  return {
    id: d.id,
    title: d.title,
    body: d.body,
    type: d.type,
    heat: d.heat,
    createdAt: d.createdAt,
    replyCount: Number(d.replyCount),
    author: {
      handle: d.authorHandle,
      displayName: d.authorDisplayName,
      avatar: d.authorAvatar,
    },
    hub: {
      slug: d.hubSlug,
      name: d.hubName,
      icon: d.hubIcon,
    },
  };
}

function serializeHub(h: HubResult) {
  return {
    id: h.id,
    slug: h.slug,
    name: h.name,
    description: h.description,
    icon: h.icon,
    memberCount: Number(h.memberCount),
    dropCount: Number(h.dropCount),
  };
}
