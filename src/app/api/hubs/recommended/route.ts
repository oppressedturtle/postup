/**
 * /api/hubs/recommended
 *
 * GET — Return recommended hubs.
 *   Authenticated: top 5 hubs by member count that the user has NOT joined.
 *   Unauthenticated: top 5 hubs by member count globally.
 *
 * Response:
 *   200  { hubs: [{ id, slug, name, icon, description, memberCount }] }
 *   500  internal error
 *
 * Caching: 5-minute Redis cache per (userId | "anon").
 */
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import logger from "@/lib/logger";

const CACHE_TTL = 5 * 60; // 5 minutes

export async function GET(): Promise<NextResponse> {
  // Auth is optional — degrade gracefully for anonymous callers
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const cacheKey = `hubs:recommended:${userId ?? "anon"}`;

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
    // Build where clause: exclude hubs the user already belongs to
    const where =
      userId
        ? {
            memberships: {
              none: { userId },
            },
          }
        : {};

    const hubs = await db.hub.findMany({
      where,
      orderBy: { memberships: { _count: "desc" } },
      take: 5,
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        description: true,
        _count: { select: { memberships: true } },
      },
    });

    const payload = {
      hubs: hubs.map((h) => ({
        id: h.id,
        slug: h.slug,
        name: h.name,
        icon: h.icon,
        description: h.description,
        memberCount: h._count.memberships,
      })),
    };

    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL);
    } catch {
      // Non-fatal
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err, userId }, "hubs: recommended query failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve recommended hubs." } },
      { status: 500 },
    );
  }
}
