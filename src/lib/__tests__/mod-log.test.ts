import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    modLog: { create: vi.fn() },
  },
}))

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { logModAction, ModActionType } from '@/lib/mod-log'
import { db } from '@/lib/db'
import logger from '@/lib/logger'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('logModAction', () => {
  it('persists an action, defaulting omitted fields to null', async () => {
    vi.mocked(db.modLog.create).mockResolvedValue({ id: 'log-1' } as never)

    await logModAction({
      moderatorId: 'mod-1',
      action: ModActionType.REMOVE_DROP,
    })

    expect(db.modLog.create).toHaveBeenCalledWith({
      data: {
        hubId: null,
        moderatorId: 'mod-1',
        action: ModActionType.REMOVE_DROP,
        targetUserId: null,
        dropId: null,
        replyId: null,
        reportId: null,
        reason: null,
      },
    })
  })

  it('passes through all provided fields', async () => {
    vi.mocked(db.modLog.create).mockResolvedValue({ id: 'log-2' } as never)

    await logModAction({
      hubId: 'hub-1',
      moderatorId: 'mod-1',
      action: ModActionType.BAN_USER,
      targetUserId: 'user-9',
      dropId: 'drop-1',
      replyId: 'reply-1',
      reportId: 'report-1',
      reason: 'spam',
    })

    expect(db.modLog.create).toHaveBeenCalledWith({
      data: {
        hubId: 'hub-1',
        moderatorId: 'mod-1',
        action: ModActionType.BAN_USER,
        targetUserId: 'user-9',
        dropId: 'drop-1',
        replyId: 'reply-1',
        reportId: 'report-1',
        reason: 'spam',
      },
    })
  })

  it('never throws when the DB write fails, and logs the error', async () => {
    vi.mocked(db.modLog.create).mockRejectedValue(new Error('db down'))

    await expect(
      logModAction({ moderatorId: 'mod-1', action: ModActionType.LOCK_DROP }),
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalled()
  })
})
