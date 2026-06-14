/**
 * /api/hubs/trending
 *
 * GET — Return the 10 hubs with the most new drops in the last 24 hours.
 *       Public endpoint, no auth required.
 *
 * Response:
 *   200  { hubs: [{ id, slug, name, icon, memberCount, newDropCount }] }
 *   500  internal error
 *
 * Caching: 10-minute Redis cache.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import logger from "@/lib/logger";

const CACHE_KEY = "hubs:trending";
const CACHE_TTL = 10 * 60; // 10 minutes

interface TrendingHubRow {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  memberCount: bigint;
  newDropCount: bigint;
}

export async function GET(): Promise<NextResponse> {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), {
        headers: { "X-Cache": "HIT" },
      });
    }
  } catch {
    // Non-fatal cache miss
  }

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rows = await db.$queryRaw<TrendingHubRow[]>`
      SELECT
        h.id,
        h.slug,
        h.name,
        h.icon,
        COUNT(DISTINCT m.id)                              AS "memberCount",
        COUNT(DISTINCT d.id) FILTER (
          WHERE d."createdAt" > ${cutoff} AND d."isRemoved" = false
        )                                                  AS "newDropCount"
      FROM "Hub" h
      LEFT JOIN "Membership" m ON m."hubId" = h.id
      LEFT JOIN "Drop" d       ON d."hubId" = h.id
      GROUP BY h.id
      HAVING COUNT(DISTINCT d.id) FILTER (
        WHERE d."createdAt" > ${cutoff} AND d."isRemoved" = false
      ) > 0
      ORDER BY "newDropCount" DESC, "memberCount" DESC
      LIMIT ${Prisma.raw("10")}
    `;

    const hubs = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      icon: r.icon,
      memberCount: Number(r.memberCount),
      newDropCount: Number(r.newDropCount),
    }));

    const payload = { hubs };

    try {
      await redis.set(CACHE_KEY, JSON.stringify(payload), "EX", CACHE_TTL);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err }, "hubs: trending query failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve trending hubs." } },
      { status: 500 },
    );
  }
}
