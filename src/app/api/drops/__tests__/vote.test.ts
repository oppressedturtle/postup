import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories must not reference outer variables (hoisting rule)
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    drop: { findUnique: vi.fn(), update: vi.fn() },
    vote: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/redis', () => ({
  redis: {
    eval: vi.fn().mockResolvedValue([1, 59]),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    scan: vi.fn().mockResolvedValue(['0', []]),
  },
}))

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { POST } from '@/app/api/drops/[id]/vote/route'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVoteRequest(dropId: string, body: unknown): Request {
  return new Request(`http://localhost/api/drops/${dropId}/vote`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeRouteContext(dropId: string) {
  return { params: Promise.resolve({ id: dropId }) }
}

function mockAuthedSession(userId = 'user-1') {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId, email: 'test@example.com' } } as any)
}

function mockUnauthSession() {
  vi.mocked(auth).mockResolvedValue(null as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  // Restore rate limiter to allow by default
  vi.mocked(redis.eval).mockResolvedValue([1, 59] as any)
  vi.mocked(redis.get).mockResolvedValue(null)
  vi.mocked(redis.scan).mockResolvedValue(['0', []] as any)
  // Default: user exists and is not suspended (requireAuth suspended check)
  vi.mocked(db.user.findUnique).mockResolvedValue({ suspended: false } as any)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/drops/[id]/vote', () => {
  describe('authentication', () => {
    it('returns 401 when unauthenticated', async () => {
      mockUnauthSession()
      const req = makeVoteRequest('drop-1', { value: 1 })
      const ctx = makeRouteContext('drop-1')
      const res = await POST(req as any, ctx as any)
      expect(res.status).toBe(401)
    })
  })

  describe('validation', () => {
    it('returns 422 for invalid value (2)', async () => {
      mockAuthedSession()
      vi.mocked(db.drop.findUnique).mockResolvedValue({
        id: 'drop-1', authorId: 'author-1', heat: 0, isRemoved: false,
      } as any)

      const req = makeVoteRequest('drop-1', { value: 2 })
      const ctx = makeRouteContext('drop-1')
      const res = await POST(req as any, ctx as any)
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 422 for value=0', async () => {
      mockAuthedSession()
      vi.mocked(db.drop.findUnique).mockResolvedValue({
        id: 'drop-1', authorId: 'author-1', heat: 0, isRemoved: false,
      } as any)
      const req = makeVoteRequest('drop-1', { value: 0 })
      const ctx = makeRouteContext('drop-1')
      const res = await POST(req as any, ctx as any)
      expect(res.status).toBe(422)
    })

    it('returns 400 for non-JSON body', async () => {
      mockAuthedSession()
      const req = new Request('http://localhost/api/drops/drop-1/vote', {
        method: 'POST',
        body: 'bad json{{',
        headers: { 'Content-Type': 'application/json' },
      })
      const ctx = makeRouteContext('drop-1')
      const res = await POST(req as any, ctx as any)
      expect(res.status).toBe(400)
    })
  })

  describe('vote semantics', () => {
    it('first vote: creates Vote, returns updated heat', async () => {
      mockAuthedSession('user-1')

      vi.mocked(db.drop.findUnique).mockResolvedValue({
        id: 'drop-1', authorId: 'author-1', heat: 5, isRemoved: false,
      } as any)

      vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          vote: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn(),
            delete: vi.fn(),
          },
          drop: {
            update: vi.fn().mockResolvedValue({ heat: 6 }),
          },
          user: {
            findUnique: vi.fn(),
            update: vi.fn(),
          },
        })
      })

      const req = makeVoteRequest('drop-1', { value: 1 })
      const ctx = makeRouteContext('drop-1')
      const res = await POST(req as any, ctx as any)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.heat).toBe(6)
      expect(body.userVote).toBe(1)
    })

    it('toggle off same vote: deletes Vote, returns null userVote', async () => {
      mockAuthedSession('user-1')

      vi.mocked(db.drop.findUnique).mockResolvedValue({
        id: 'drop-1', authorId: 'author-2', heat: 1, isRemoved: false,
      } as any)

      vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          vote: {
            findUnique: vi.fn().mockResolvedValue({ id: 'vote-id', value: 1 }),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn().mockResolvedValue({}),
          },
          drop: {
            update: vi.fn().mockResolvedValue({ heat: 0 }),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({ clout: 5 }),
            update: vi.fn(),
          },
        })
      })

      const req = makeVoteRequest('drop-1', { value: 1 })
      const ctx = makeRouteContext('drop-1')
      const res = await POST(req as any, ctx as any)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.userVote).toBeNull()
      expect(body.heat).toBe(0)
    })

    it('flip vote: updates Vote, returns updated heat', async () => {
      mockAuthedSession('user-1')

      vi.mocked(db.drop.findUnique).mockResolvedValue({
        id: 'drop-1', authorId: 'author-2', heat: -1, isRemoved: false,
      } as any)

      vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          vote: {
            findUnique: vi.fn().mockResolvedValue({ id: 'vote-id', value: -1 }), // had downvote
            create: vi.fn(),
            update: vi.fn().mockResolvedValue({}),
            delete: vi.fn(),
          },
          drop: {
            // heatDelta = 1 - (-1) = 2; from -1 → 1
            update: vi.fn().mockResolvedValue({ heat: 1 }),
          },
          user: {
            findUnique: vi.fn(),
            update: vi.fn(),
          },
        })
      })

      const req = makeVoteRequest('drop-1', { value: 1 })
      const ctx = makeRouteContext('drop-1')
      const res = await POST(req as any, ctx as any)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.userVote).toBe(1)
      expect(body.heat).toBe(1)
    })

    it('self-vote: heat changes but Clout update is NOT called', async () => {
      const userId = 'self-user'
      mockAuthedSession(userId)

      vi.mocked(db.drop.findUnique).mockResolvedValue({
        id: 'drop-1',
        authorId: userId, // same as voter
        heat: 0,
        isRemoved: false,
      } as any)

      const mockTxUserUpdate = vi.fn()

      vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          vote: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn(),
            delete: vi.fn(),
          },
          drop: {
            update: vi.fn().mockResolvedValue({ heat: 1 }),
          },
          user: {
            findUnique: vi.fn(),
            update: mockTxUserUpdate,
          },
        })
      })

      const req = makeVoteRequest('drop-1', { value: 1 })
      const ctx = makeRouteContext('drop-1')
      const res = await POST(req as any, ctx as any)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.heat).toBe(1)
      // Clout update must NOT have been called (self-vote)
      expect(mockTxUserUpdate).not.toHaveBeenCalled()
    })

    it('returns 404 for a missing drop', async () => {
      mockAuthedSession()
      vi.mocked(db.drop.findUnique).mockResolvedValue(null)

      const req = makeVoteRequest('nonexistent', { value: 1 })
      const ctx = makeRouteContext('nonexistent')
      const res = await POST(req as any, ctx as any)
      expect(res.status).toBe(404)
    })

    it('returns 404 for a removed drop', async () => {
      mockAuthedSession()
      vi.mocked(db.drop.findUnique).mockResolvedValue({
        id: 'drop-1', authorId: 'a', heat: 0, isRemoved: true,
      } as any)

      const req = makeVoteRequest('drop-1', { value: 1 })
      const ctx = makeRouteContext('drop-1')
      const res = await POST(req as any, ctx as any)
      expect(res.status).toBe(404)
    })
  })
})
