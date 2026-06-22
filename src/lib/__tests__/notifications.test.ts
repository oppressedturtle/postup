import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    notification: { findFirst: vi.fn(), create: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/redis', () => ({
  redis: {
    publish: vi.fn().mockResolvedValue(1),
  },
}))

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  createNotification,
  notifyMentions,
  NotificationType,
} from '@/lib/notifications'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import logger from '@/lib/logger'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createNotification', () => {
  it('creates the notification and publishes to Redis when no duplicate exists', async () => {
    vi.mocked(db.notification.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.notification.create).mockResolvedValue({ id: 'n-1' } as never)

    await createNotification('user-1', NotificationType.REPLY_TO_DROP, {
      dropId: 'drop-1',
      replyId: 'reply-1',
    })

    expect(db.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: NotificationType.REPLY_TO_DROP,
        payload: { dropId: 'drop-1', replyId: 'reply-1' },
      },
    })
    expect(redis.publish).toHaveBeenCalledWith(
      'notifications:user-1',
      expect.stringContaining('REPLY_TO_DROP'),
    )
  })

  it('skips creation when a duplicate exists within the dedup window', async () => {
    vi.mocked(db.notification.findFirst).mockResolvedValue({ id: 'dup' } as never)

    await createNotification('user-1', NotificationType.REPLY_TO_DROP, {
      replyId: 'reply-1',
    })

    expect(db.notification.create).not.toHaveBeenCalled()
    expect(redis.publish).not.toHaveBeenCalled()
  })

  it('dedups on the replyId JSON path when replyId is present', async () => {
    vi.mocked(db.notification.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.notification.create).mockResolvedValue({ id: 'n-1' } as never)

    await createNotification('user-1', NotificationType.REPLY_TO_REPLY, {
      replyId: 'reply-9',
      dropId: 'drop-9',
    })

    const where = vi.mocked(db.notification.findFirst).mock.calls[0]![0]!.where
    expect(where).toMatchObject({
      payload: { path: ['replyId'], equals: 'reply-9' },
    })
  })

  it('dedups on the dropId JSON path when only dropId is present', async () => {
    vi.mocked(db.notification.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.notification.create).mockResolvedValue({ id: 'n-1' } as never)

    await createNotification('user-1', NotificationType.MENTION, {
      dropId: 'drop-9',
    })

    const where = vi.mocked(db.notification.findFirst).mock.calls[0]![0]!.where
    expect(where).toMatchObject({
      payload: { path: ['dropId'], equals: 'drop-9' },
    })
  })

  it('never throws when the DB create fails, and logs the error', async () => {
    vi.mocked(db.notification.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.notification.create).mockRejectedValue(new Error('db down'))

    await expect(
      createNotification('user-1', NotificationType.DROP_BOOSTED, { dropId: 'd' }),
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalled()
  })
})

describe('notifyMentions', () => {
  it('is a no-op when no handles are supplied', async () => {
    await notifyMentions('user-1', 'alice', [], { dropId: 'drop-1' })

    expect(db.user.findMany).not.toHaveBeenCalled()
  })

  it('resolves handles (excluding the mentioner) and notifies each user', async () => {
    vi.mocked(db.user.findMany).mockResolvedValue([
      { id: 'user-2' },
      { id: 'user-3' },
    ] as never)
    vi.mocked(db.notification.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.notification.create).mockResolvedValue({ id: 'n' } as never)

    await notifyMentions('user-1', 'alice', ['bob', 'carol'], { dropId: 'drop-1' })

    expect(db.user.findMany).toHaveBeenCalledWith({
      where: {
        handle: { in: ['bob', 'carol'], mode: 'insensitive' },
        NOT: { id: 'user-1' },
      },
      select: { id: true },
    })
    expect(db.notification.create).toHaveBeenCalledTimes(2)
    const firstPayload = vi.mocked(db.notification.create).mock.calls[0]![0]!.data
      .payload
    expect(firstPayload).toMatchObject({ mentionerHandle: 'alice', dropId: 'drop-1' })
  })

  it('never throws when the user lookup fails, and logs the error', async () => {
    vi.mocked(db.user.findMany).mockRejectedValue(new Error('db down'))

    await expect(
      notifyMentions('user-1', 'alice', ['bob'], { dropId: 'drop-1' }),
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalled()
  })
})
