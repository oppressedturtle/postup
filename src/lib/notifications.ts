/**
 * Notification creation helpers for PostUp.
 *
 * Centralises all write paths for the Notification model so individual
 * route handlers don't have to repeat deduplication and pub/sub logic.
 *
 * Pub/sub note: after persisting a notification we fire-and-forget a Redis
 * PUBLISH on the channel `notifications:<userId>`. This lets a future SSE or
 * WebSocket layer push real-time alerts without coupling the write path.
 */
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import logger from "@/lib/logger";
import { NotificationType } from "@/generated/prisma/client";

// Re-export so callers can import from a single lib path.
export { NotificationType };

// ---------------------------------------------------------------------------
// createNotification
// ---------------------------------------------------------------------------

/**
 * Persist a single notification for `userId`.
 *
 * Deduplication: if a notification with the same (userId, type, replyId in
 * payload) already exists within the last 5 minutes the call is a no-op.
 * This prevents notification storms when, e.g., an author edits a reply and
 * triggers the same notification twice.
 *
 * Failures are logged but never throw — notification delivery is best-effort
 * and must never block the primary write path (reply creation, etc.).
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    // Dedup window: look for an identical notification in the last 5 minutes.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // We dedup on the combination of userId + type + replyId (the primary
    // differentiator for reply notifications). For MENTION we additionally
    // include dropId to distinguish separate mention notifications in the same
    // drop vs. across drops.
    const replyId = payload.replyId as string | undefined;
    const dropId = payload.dropId as string | undefined;

    const existing = await db.notification.findFirst({
      where: {
        userId,
        type,
        createdAt: { gte: fiveMinutesAgo },
        // Prisma JSON path filter — exact match on the replyId field in payload.
        ...(replyId !== undefined
          ? { payload: { path: ["replyId"], equals: replyId } }
          : dropId !== undefined
            ? { payload: { path: ["dropId"], equals: dropId } }
            : {}),
      },
      select: { id: true },
    });

    if (existing) {
      return; // Duplicate — skip
    }

    await db.notification.create({
      data: { userId, type, payload: payload as Prisma.InputJsonValue },
    });

    // Fire-and-forget: publish to Redis channel so real-time consumers wake up.
    redis
      .publish(`notifications:${userId}`, JSON.stringify({ type, payload }))
      .catch((err: unknown) => {
        logger.warn({ err, userId }, "notifications: redis publish failed");
      });
  } catch (err) {
    // Best-effort — log but never bubble up to the caller.
    logger.error({ err, userId, type }, "notifications: createNotification failed");
  }
}

// ---------------------------------------------------------------------------
// notifyMentions
// ---------------------------------------------------------------------------

/**
 * Send MENTION notifications to all users referenced by @handle in content.
 *
 * - Resolves handles to user IDs in a single batch DB query.
 * - Skips self-mentions (mentioner === mentioned).
 * - Calls `createNotification` for each resolved user (dedup enforced there).
 *
 * @param mentionerUserId   The ID of the user who authored the content.
 * @param mentionerHandle   The handle of the mentioner (for the payload).
 * @param handles           Handles extracted by `extractMentions()`.
 * @param payload           Context attached to each notification (dropId / replyId).
 */
export async function notifyMentions(
  mentionerUserId: string,
  mentionerHandle: string,
  handles: string[],
  payload: { dropId?: string; replyId?: string },
): Promise<void> {
  if (handles.length === 0) return;

  try {
    const users = await db.user.findMany({
      where: {
        handle: { in: handles, mode: "insensitive" },
        // Skip self-mentions at the DB query level.
        NOT: { id: mentionerUserId },
      },
      select: { id: true },
    });

    await Promise.all(
      users.map((u) =>
        createNotification(u.id, NotificationType.MENTION, {
          mentionerHandle,
          ...payload,
        }),
      ),
    );
  } catch (err) {
    logger.error({ err, mentionerUserId, handles }, "notifications: notifyMentions failed");
  }
}
