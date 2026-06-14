/**
 * /api/notifications
 *
 * GET   — Paginated list of notifications for the authenticated user.
 *         Also returns the current unread count.
 * PATCH — Mark notifications as read (by IDs or all).
 *
 * GET responses:
 *   200  { notifications, nextCursor, unreadCount }
 *   401  unauthenticated
 *   500  internal error
 *
 * PATCH responses:
 *   200  { updated: number }
 *   400  invalid JSON
 *   401  unauthenticated
 *   422  validation error
 *   500  internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireAuth } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_LIMIT = 20;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const getCursorSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(PAGE_LIMIT),
});

const patchSchema = z
  .object({
    ids: z.array(z.string()).min(1).max(100).optional(),
    all: z.boolean().optional(),
  })
  .refine((d) => d.ids !== undefined || d.all === true, {
    message: "Provide either 'ids' (array of notification IDs) or 'all: true'.",
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unreadCacheKey(userId: string): string {
  return `notif:unread:${userId}`;
}

async function invalidateUnreadCache(userId: string): Promise<void> {
  try {
    await redis.del(unreadCacheKey(userId));
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// GET /api/notifications
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const { searchParams } = new URL(request.url);
  const parsed = getCursorSchema.safeParse({
    cursor: searchParams.get("cursor") ?? undefined,
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

  const { cursor, limit } = parsed.data;

  try {
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: {
          userId: user.id,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1, // Fetch one extra to determine if there's a next page
      }),
      db.notification.count({
        where: { userId: user.id, read: false },
      }),
    ]);

    let nextCursor: string | null = null;
    if (notifications.length > limit) {
      notifications.pop();
      nextCursor = notifications[notifications.length - 1]?.id ?? null;
    }

    return NextResponse.json({ notifications, nextCursor, unreadCount });
  } catch (err) {
    logger.error({ err, userId: user.id }, "notifications: GET failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve notifications." } },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/notifications
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
): Promise<NextResponse> {
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  try {
    let updated: { count: number };

    if (parsed.data.all === true) {
      updated = await db.notification.updateMany({
        where: { userId: user.id, read: false },
        data: { read: true },
      });
    } else {
      // Mark only the specified IDs — ensure they belong to this user.
      updated = await db.notification.updateMany({
        where: {
          id: { in: parsed.data.ids },
          userId: user.id,
          read: false,
        },
        data: { read: true },
      });
    }

    await invalidateUnreadCache(user.id);

    logger.info(
      { userId: user.id, count: updated.count, all: parsed.data.all },
      "notifications: PATCH marked read",
    );

    return NextResponse.json({ updated: updated.count });
  } catch (err) {
    logger.error({ err, userId: user.id }, "notifications: PATCH failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update notifications." } },
      { status: 500 },
    );
  }
}
