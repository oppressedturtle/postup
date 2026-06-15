import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// In-memory Redis mock backed by a Map (sorted-set semantics simplified)
// Defined INSIDE the vi.mock factory so hoisting works correctly.
// ---------------------------------------------------------------------------

vi.mock('@/lib/redis', () => {
  type ZSetEntry = { score: number; member: string }
  const store = new Map<string, ZSetEntry[]>()

  const evalMock = vi.fn(async (
    _script: string,
    _numKeys: number,
    key: string,
    nowStr: string,
    windowStartStr: string,
    limitStr: string,
    windowMsStr: string,
  ): Promise<[number, number]> => {
    const now = Number(nowStr)
    const windowStart = Number(windowStartStr)
    const limit = Number(limitStr)
    const windowMs = Number(windowMsStr)

    // Simulate ZREMRANGEBYSCORE — keep only entries with score > windowStart
    const existing = (store.get(key) ?? []).filter((e) => e.score > windowStart)
    const count = existing.length

    if (count < limit) {
      existing.push({ score: now, member: String(now) })
      store.set(key, existing)
      return [1, limit - count - 1]
    } else {
      store.set(key, existing)
      return [0, 0]
    }
  })

  // Expose store so tests can pre-populate it
  ;(globalThis as any).__rateLimitStore__ = store

  return {
    redis: { eval: evalMock },
    // expose evalMock so tests can inspect it
    __evalMock__: evalMock,
  }
})

// Import AFTER mocking so the module picks up our mock
import { rateLimit } from '@/lib/rate-limit'
import { redis } from '@/lib/redis'

function getStore(): Map<string, Array<{ score: number; member: string }>> {
  return (globalThis as any).__rateLimitStore__
}

beforeEach(() => {
  getStore().clear()
  vi.mocked(redis.eval).mockClear()
})

describe('rateLimit', () => {
  it('returns success=true and correct remaining for first request', async () => {
    const result = await rateLimit('test:key', 5, 60)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(4) // 5 limit - 1 used = 4 remaining
  })

  it('decrements remaining on each successive call', async () => {
    for (let i = 0; i < 3; i++) {
      await rateLimit('multi:key', 5, 60)
    }
    const result = await rateLimit('multi:key', 5, 60)
    expect(result.remaining).toBe(1) // 4th call out of 5, 1 slot left
  })

  it('returns success=false and remaining=0 when at the limit', async () => {
    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      await rateLimit('limit:key', 5, 60)
    }
    // 6th request is over the limit
    const result = await rateLimit('limit:key', 5, 60)
    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('includes a reset timestamp roughly 60s from now', async () => {
    const before = Math.floor(Date.now() / 1000)
    const result = await rateLimit('reset:key', 10, 60)
    const after = Math.ceil(Date.now() / 1000) + 60

    expect(result.reset).toBeGreaterThanOrEqual(before + 60)
    expect(result.reset).toBeLessThanOrEqual(after + 1)
  })

  it('isolates different keys from each other', async () => {
    // Exhaust key A
    for (let i = 0; i < 3; i++) {
      await rateLimit('isolated:a', 3, 60)
    }
    const aResult = await rateLimit('isolated:a', 3, 60)
    expect(aResult.success).toBe(false)

    // Key B should still be fresh
    const bResult = await rateLimit('isolated:b', 3, 60)
    expect(bResult.success).toBe(true)
  })

  it('window reset: stale entries outside the window are pruned', async () => {
    const key = 'window:reset:key'
    const now = Date.now()
    // Pre-populate with a stale entry (2 seconds in the past, but the window is only 1s)
    getStore().set(`rl:${key}`, [{ score: now - 2000, member: String(now - 2000) }])

    // With limit=2 and windowSeconds=1, the stale entry should be pruned.
    // The mock's ZREMRANGEBYSCORE logic removes entries <= windowStart (now - 1000).
    const result = await rateLimit(key, 2, 1) // 1 second window
    expect(result.success).toBe(true)
    // After pruning the stale entry, only 1 new entry was added → 1 remaining
    expect(result.remaining).toBe(1)
  })

  it('passes the correct Redis key prefixed with rl:', async () => {
    await rateLimit('mykey', 5, 60)
    const evalMock = vi.mocked(redis.eval)
    const callArgs = evalMock.mock.calls[0] as unknown[]
    // The key argument (index 2) must be the prefixed key
    expect(callArgs[2]).toBe('rl:mykey')
  })
})
