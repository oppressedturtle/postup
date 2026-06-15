import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories must not reference outer variables (hoisting rule)
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    hub: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    membership: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/redis', () => ({
  redis: {
    eval: vi.fn().mockResolvedValue([1, 2]),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}))

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/hubs/route'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/hubs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeGetRequest(qs = ''): NextRequest {
  return new NextRequest(`http://localhost/api/hubs${qs ? '?' + qs : ''}`)
}

function mockAuthed(userId = 'user-1') {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId, email: 'test@example.com' } } as any)
}

function mockUnauthed() {
  vi.mocked(auth).mockResolvedValue(null as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(redis.eval).mockResolvedValue([1, 2] as any)
  vi.mocked(redis.get).mockResolvedValue(null)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/hubs', () => {
  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockUnauthed()
      const req = makePostRequest({ name: 'testhub', description: 'A test hub' })
      const res = await POST(req as any)
      expect(res.status).toBe(401)
    })
  })

  describe('validation', () => {
    it('returns 422 for invalid hub name (uppercase letters)', async () => {
      mockAuthed()
      const req = makePostRequest({ name: 'TestHub', description: 'desc' })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 422 for hub name with spaces', async () => {
      mockAuthed()
      const req = makePostRequest({ name: 'my hub', description: 'desc' })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
    })

    it('returns 422 for hub name with hyphens', async () => {
      mockAuthed()
      const req = makePostRequest({ name: 'my-hub', description: 'desc' })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
    })

    it('returns 422 for description longer than 500 chars', async () => {
      mockAuthed()
      const req = makePostRequest({ name: 'validhub', description: 'x'.repeat(501) })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
    })

    it('returns 400 for non-JSON body', async () => {
      mockAuthed()
      const req = new Request('http://localhost/api/hubs', {
        method: 'POST',
        body: 'not json',
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req as any)
      expect(res.status).toBe(400)
    })
  })

  describe('conflicts', () => {
    it('returns 409 when hub slug is already taken', async () => {
      mockAuthed()
      vi.mocked(db.hub.findUnique).mockResolvedValue({ id: 'existing-hub' } as any)

      const req = makePostRequest({ name: 'existinghub', description: 'desc' })
      const res = await POST(req as any)
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.code).toBe('SLUG_TAKEN')
    })
  })

  describe('successful creation', () => {
    it('returns 201 with hub on valid input', async () => {
      mockAuthed('user-1')
      vi.mocked(db.hub.findUnique).mockResolvedValue(null) // slug not taken

      const createdHub = {
        id: 'hub-1',
        name: 'codinghub',
        slug: 'codinghub',
        description: 'A coding hub',
        rules: '',
        nsfw: false,
        createdById: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          hub: { create: vi.fn().mockResolvedValue(createdHub) },
          membership: { create: vi.fn().mockResolvedValue({}) },
        })
      })

      const req = makePostRequest({ name: 'codinghub', description: 'A coding hub' })
      const res = await POST(req as any)
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.hub.slug).toBe('codinghub')
      expect(body.hub.name).toBe('codinghub')
    })

    it('creates hub with nsfw=true when specified', async () => {
      mockAuthed('user-1')
      vi.mocked(db.hub.findUnique).mockResolvedValue(null)

      const createdHub = { id: 'hub-2', name: 'adultshub', slug: 'adultshub', nsfw: true }

      vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
        return fn({
          hub: { create: vi.fn().mockResolvedValue(createdHub) },
          membership: { create: vi.fn().mockResolvedValue({}) },
        })
      })

      const req = makePostRequest({ name: 'adultshub', description: 'desc', nsfw: true })
      const res = await POST(req as any)
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.hub.nsfw).toBe(true)
    })
  })
})

describe('GET /api/hubs', () => {
  it('returns 200 with an array of hubs', async () => {
    const hubsList = [
      { id: 'hub-1', name: 'codinghub', slug: 'codinghub', _count: { memberships: 42 } },
      { id: 'hub-2', name: 'gaminghub', slug: 'gaminghub', _count: { memberships: 7 } },
    ]
    vi.mocked(db.hub.findMany).mockResolvedValue(hubsList as any)

    const req = makeGetRequest()
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.hubs)).toBe(true)
    expect(body.hubs).toHaveLength(2)
  })

  it('returns empty array when no hubs exist', async () => {
    vi.mocked(db.hub.findMany).mockResolvedValue([])

    const req = makeGetRequest()
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hubs).toEqual([])
    expect(body.nextCursor).toBeNull()
  })

  it('returns nextCursor when there are more pages', async () => {
    // Return limit+1 items (default limit = 20)
    const hubs = Array.from({ length: 21 }, (_, i) => ({
      id: `hub-${i}`,
      name: `hub${i}`,
      slug: `hub${i}`,
      _count: { memberships: i },
    }))
    vi.mocked(db.hub.findMany).mockResolvedValue(hubs as any)

    const req = makeGetRequest('limit=20')
    const res = await GET(req as any)
    const body = await res.json()
    expect(body.nextCursor).toBeTruthy()
    expect(body.hubs).toHaveLength(20)
  })

  it('includes member counts in the response', async () => {
    vi.mocked(db.hub.findMany).mockResolvedValue([
      { id: 'hub-1', name: 'testhub', slug: 'testhub', _count: { memberships: 99 } },
    ] as any)
    const req = makeGetRequest()
    const res = await GET(req as any)
    const body = await res.json()
    expect(body.hubs[0]._count.memberships).toBe(99)
  })

  it('returns 500 on database error', async () => {
    vi.mocked(db.hub.findMany).mockRejectedValue(new Error('DB failure'))
    const req = makeGetRequest()
    const res = await GET(req as any)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })
})
