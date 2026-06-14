/**
 * Moderation log helper for PostUp.
 *
 * Wraps db.modLog.create() so that every moderation action is persisted in a
 * single, consistent place. Never throws — logging failures must never block
 * the moderation action that triggered them.
 */
import { ModActionType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import logger from "@/lib/logger";

export { ModActionType };

export interface LogModActionParams {
  /** Hub context; null/undefined for site-wide (OVERSEER) actions. */
  hubId?: string;
  moderatorId: string;
  action: ModActionType;
  targetUserId?: string;
  dropId?: string;
  replyId?: string;
  reportId?: string;
  reason?: string;
}

/**
 * Persist a moderation action to the ModLog table.
 *
 * Failures are caught and logged — callers must not await this for correctness.
 * It is still async so callers can await it where they want guaranteed delivery
 * (e.g., report resolution), but the absence of a log entry must never fail a
 * moderation action.
 */
export async function logModAction(params: LogModActionParams): Promise<void> {
  try {
    await db.modLog.create({
      data: {
        hubId: params.hubId ?? null,
        moderatorId: params.moderatorId,
        action: params.action,
        targetUserId: params.targetUserId ?? null,
        dropId: params.dropId ?? null,
        replyId: params.replyId ?? null,
        reportId: params.reportId ?? null,
        reason: params.reason ?? null,
      },
    });
  } catch (err) {
    logger.error(
      { err, params },
      "mod-log: failed to persist moderation action",
    );
  }
}
