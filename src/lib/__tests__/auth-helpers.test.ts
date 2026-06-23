import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks — factories must not reference outer variables (hoisting rule)
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    membership: { findUnique: vi.fn() },
  },
}))

import {
  requireAuth,
  requireOverseer,
  requireWarden,
} from '@/lib/auth-helpers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

const USER = { id: 'user-1', role: 'MEMBER' as const }
const HUB = 'hub-1'

beforeEach(() => {
  vi.clearAllMocks()
  // Default: the authenticated user exists and is not suspended. Individual
  // tests override this to exercise the defence-in-depth suspended check.
  vi.mocked(db.user.findUnique).mockResolvedValue({ suspended: false } as never)
})

async function bodyOf(res: NextResponse) {
  return (await res.json()) as { error: { code: string; message: string } }
}

describe('requireAuth', () => {
  it('returns the session user when a valid session exists', async () => {
    vi.mocked(auth).mockResolvedValue({ user: USER } as never)

    const result = await requireAuth()

    expect(result).not.toBeInstanceOf(NextResponse)
    expect(result).toEqual(USER)
  })

  it('returns a 401 NextResponse when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const result = await requireAuth()

    expect(result).toBeInstanceOf(NextResponse)
    const res = result as NextResponse
    expect(res.status).toBe(401)
    expect((await bodyOf(res)).error.code).toBe('UNAUTHENTICATED')
  })

  it('returns a 401 when the session has no user id', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: undefined } } as never)

    const result = await requireAuth()

    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
  })

  it('returns a 403 SUSPENDED when the user record is flagged suspended', async () => {
    vi.mocked(auth).mockResolvedValue({ user: USER } as never)
    vi.mocked(db.user.findUnique).mockResolvedValue({ suspended: true } as never)

    const result = await requireAuth()

    expect(result).toBeInstanceOf(NextResponse)
    const res = result as NextResponse
    expect(res.status).toBe(403)
    expect((await bodyOf(res)).error.code).toBe('SUSPENDED')
  })

  it('returns a 403 SUSPENDED when the user record no longer exists', async () => {
    vi.mocked(auth).mockResolvedValue({ user: USER } as never)
    vi.mocked(db.user.findUnique).mockResolvedValue(null as never)

    const result = await requireAuth()

    expect((result as NextResponse).status).toBe(403)
    expect((await bodyOf(result as NextResponse)).error.code).toBe('SUSPENDED')
  })
})

describe('requireOverseer', () => {
  it('returns the user when the role is OVERSEER', async () => {
    const overseer = { id: 'admin-1', role: 'OVERSEER' as const }
    vi.mocked(auth).mockResolvedValue({ user: overseer } as never)

    const result = await requireOverseer()

    expect(result).toEqual(overseer)
  })

  it('returns a 403 when the user is authenticated but not an Overseer', async () => {
    vi.mocked(auth).mockResolvedValue({ user: USER } as never)

    const result = await requireOverseer()

    expect(result).toBeInstanceOf(NextResponse)
    const res = result as NextResponse
    expect(res.status).toBe(403)
    expect((await bodyOf(res)).error.code).toBe('FORBIDDEN')
  })

  it('propagates the 401 from requireAuth when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const result = await requireOverseer()

    expect((result as NextResponse).status).toBe(401)
  })
})

describe('requireWarden', () => {
  it('returns the membership when the caller is a WARDEN of the hub', async () => {
    vi.mocked(auth).mockResolvedValue({ user: USER } as never)
    const membership = { id: 'm-1', userId: USER.id, hubId: HUB, role: 'WARDEN' }
    vi.mocked(db.membership.findUnique).mockResolvedValue(membership as never)

    const result = await requireWarden(HUB)

    expect(result).toEqual(membership)
    expect(db.membership.findUnique).toHaveBeenCalledWith({
      where: { userId_hubId: { userId: USER.id, hubId: HUB } },
    })
  })

  it('returns a 403 when the caller has no membership for the hub', async () => {
    vi.mocked(auth).mockResolvedValue({ user: USER } as never)
    vi.mocked(db.membership.findUnique).mockResolvedValue(null as never)

    const result = await requireWarden(HUB)

    expect((result as NextResponse).status).toBe(403)
    expect((await bodyOf(result as NextResponse)).error.code).toBe('FORBIDDEN')
  })

  it('returns a 403 when the caller is a member but not a WARDEN', async () => {
    vi.mocked(auth).mockResolvedValue({ user: USER } as never)
    vi.mocked(db.membership.findUnique).mockResolvedValue({
      id: 'm-1',
      role: 'MEMBER',
    } as never)

    const result = await requireWarden(HUB)

    expect((result as NextResponse).status).toBe(403)
  })

  it('propagates the 401 from requireAuth without querying the DB', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const result = await requireWarden(HUB)

    expect((result as NextResponse).status).toBe(401)
    expect(db.membership.findUnique).not.toHaveBeenCalled()
  })
})
