import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — vi.mock is hoisted, so factories MUST NOT reference outer const vars.
// Instead, use vi.fn() inline and grab typed references via vi.mocked() after
// the import.
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

// Redis for rate limiter — always allow in these tests
vi.mock('@/lib/redis', () => ({
  redis: {
    eval: vi.fn().mockResolvedValue([1, 9]), // success, 9 remaining
  },
}))

// Silence logger output during tests
vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Import route AFTER mocks are in place
import { POST } from '@/app/api/auth/register/route'
import { db } from '@/lib/db'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Restore the rate limiter mock to always allow (clearAllMocks resets return values)
  vi.mocked(db.user.findUnique).mockReset()
  vi.mocked(db.user.create).mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/register', () => {
  describe('validation errors', () => {
    it('returns 422 for missing email', async () => {
      const req = makeRequest({ password: 'password123', handle: 'alice' })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 422 for invalid email format', async () => {
      const req = makeRequest({ email: 'not-an-email', password: 'password123', handle: 'alice' })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
    })

    it('returns 422 for missing password', async () => {
      const req = makeRequest({ email: 'alice@example.com', handle: 'alice' })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
    })

    it('returns 422 for password shorter than 8 characters', async () => {
      const req = makeRequest({ email: 'alice@example.com', password: 'short', handle: 'alice' })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.details?.password).toBeDefined()
    })

    it('returns 422 for handle with spaces', async () => {
      const req = makeRequest({ email: 'alice@example.com', password: 'password123', handle: 'bad handle' })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
    })

    it('returns 422 for handle shorter than 3 characters', async () => {
      const req = makeRequest({ email: 'alice@example.com', password: 'password123', handle: 'ab' })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
    })

    it('returns 422 for handle with special characters', async () => {
      const req = makeRequest({ email: 'alice@example.com', password: 'password123', handle: 'bad@handle' })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
    })

    it('returns 400 for non-JSON body', async () => {
      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        body: 'not json {{',
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req as any)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('INVALID_BODY')
    })
  })

  describe('uniqueness conflicts', () => {
    it('returns 409 when email is already taken', async () => {
      vi.mocked(db.user.findUnique)
        .mockResolvedValueOnce({ id: 'existing-id' } as any) // email taken
        .mockResolvedValueOnce(null)                           // handle free

      const req = makeRequest({ email: 'taken@example.com', password: 'password123', handle: 'alice' })
      const res = await POST(req as any)
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.code).toBe('EMAIL_TAKEN')
    })

    it('returns 409 when handle is already taken', async () => {
      vi.mocked(db.user.findUnique)
        .mockResolvedValueOnce(null)                           // email free
        .mockResolvedValueOnce({ id: 'existing-id' } as any) // handle taken

      const req = makeRequest({ email: 'new@example.com', password: 'password123', handle: 'taken_handle' })
      const res = await POST(req as any)
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.code).toBe('HANDLE_TAKEN')
    })
  })

  describe('successful registration', () => {
    it('returns 201 with user data on valid input', async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue(null) // both email and handle free

      const createdUser = { id: 'new-user-id', email: 'alice@example.com', handle: 'alice' }
      vi.mocked(db.user.create).mockResolvedValue(createdUser as any)

      const req = makeRequest({ email: 'alice@example.com', password: 'password123', handle: 'alice' })
      const res = await POST(req as any)
      expect(res.status).toBe(201)

      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.user.id).toBe('new-user-id')
      expect(body.user.email).toBe('alice@example.com')
      expect(body.user.handle).toBe('alice')
    })

    it('does not expose password hash in response', async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue(null)
      vi.mocked(db.user.create).mockResolvedValue({ id: 'uid', email: 'bob@example.com', handle: 'bob' } as any)

      const req = makeRequest({ email: 'bob@example.com', password: 'securepass', handle: 'bob123' })
      const res = await POST(req as any)
      const body = await res.json()

      expect(body.user.passwordHash).toBeUndefined()
      expect(body.user.password).toBeUndefined()
    })
  })

  describe('server errors', () => {
    it('returns 500 when db.user.create throws', async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue(null)
      vi.mocked(db.user.create).mockRejectedValue(new Error('DB connection error'))

      const req = makeRequest({ email: 'charlie@example.com', password: 'password123', handle: 'charlie' })
      const res = await POST(req as any)
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })
})
