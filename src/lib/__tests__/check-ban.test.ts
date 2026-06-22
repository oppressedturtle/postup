import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — factories must not reference outer variables (hoisting rule)
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  db: {
    hubBan: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { isUserBanned, invalidateBanCache } from '@/lib/check-ban'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'

const USER = 'user-1'
const HUB = 'hub-1'
const KEY = `ban:${USER}:${HUB}`

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isUserBanned', () => {
  it('returns true on a "1" cache hit without touching the DB', async () => {
    vi.mocked(redis.get).mockResolvedValue('1')

    const result = await isUserBanned(USER, HUB)

    expect(result).toBe(true)
    expect(redis.get).toHaveBeenCalledWith(KEY)
    expect(db.hubBan.findUnique).not.toHaveBeenCalled()
  })

  it('returns false on a "0" cache hit without touching the DB', async () => {
    vi.mocked(redis.get).mockResolvedValue('0')

    const result = await isUserBanned(USER, HUB)

    expect(result).toBe(false)
    expect(db.hubBan.findUnique).not.toHaveBeenCalled()
  })

  it('queries the DB on a cache miss and back-fills "1" when banned', async () => {
    vi.mocked(redis.get).mockResolvedValue(null)
    vi.mocked(db.hubBan.findUnique).mockResolvedValue({ id: 'ban-1' } as never)

    const result = await isUserBanned(USER, HUB)

    expect(result).toBe(true)
    expect(db.hubBan.findUnique).toHaveBeenCalledWith({
      where: { userId_hubId: { userId: USER, hubId: HUB } },
      select: { id: true },
    })
    expect(redis.set).toHaveBeenCalledWith(KEY, '1', 'EX', 300)
  })

  it('queries the DB on a cache miss and back-fills "0" when not banned', async () => {
    vi.mocked(redis.get).mockResolvedValue(null)
    vi.mocked(db.hubBan.findUnique).mockResolvedValue(null as never)

    const result = await isUserBanned(USER, HUB)

    expect(result).toBe(false)
    expect(redis.set).toHaveBeenCalledWith(KEY, '0', 'EX', 300)
  })

  it('falls back to the DB when the Redis read throws', async () => {
    vi.mocked(redis.get).mockRejectedValue(new Error('redis down'))
    vi.mocked(db.hubBan.findUnique).mockResolvedValue({ id: 'ban-1' } as never)

    const result = await isUserBanned(USER, HUB)

    expect(result).toBe(true)
    expect(db.hubBan.findUnique).toHaveBeenCalled()
  })

  it('still returns the DB result when the cache back-fill write fails', async () => {
    vi.mocked(redis.get).mockResolvedValue(null)
    vi.mocked(db.hubBan.findUnique).mockResolvedValue({ id: 'ban-1' } as never)
    vi.mocked(redis.set).mockRejectedValue(new Error('redis down'))

    const result = await isUserBanned(USER, HUB)

    expect(result).toBe(true)
  })

  it('fails open (returns false) when the DB query throws', async () => {
    vi.mocked(redis.get).mockResolvedValue(null)
    vi.mocked(db.hubBan.findUnique).mockRejectedValue(new Error('db down'))

    const result = await isUserBanned(USER, HUB)

    expect(result).toBe(false)
  })
})

describe('invalidateBanCache', () => {
  it('deletes the ban cache key', async () => {
    vi.mocked(redis.del).mockResolvedValue(1)

    await invalidateBanCache(USER, HUB)

    expect(redis.del).toHaveBeenCalledWith(KEY)
  })

  it('swallows Redis errors without throwing', async () => {
    vi.mocked(redis.del).mockRejectedValue(new Error('redis down'))

    await expect(invalidateBanCache(USER, HUB)).resolves.toBeUndefined()
  })
})
