import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { VoteButtons } from '../vote-buttons'

// next/link needs a minimal stub in jsdom
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

function mockFetchVote(heat: number, userVote: 1 | -1 | null) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ heat, userVote }),
  })
}

describe('VoteButtons', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: 'user-1', handle: 'testuser', email: 'test@example.com', role: 'MEMBER' as const, clout: 0 }, expires: '' },
      status: 'authenticated',
      update: vi.fn(),
    })
    mockPush.mockClear()
  })

  it('renders initial heat score', () => {
    mockFetchVote(5, null)
    render(
      <VoteButtons resourceId="drop-1" initialHeat={5} initialUserVote={null} />,
    )
    expect(screen.getByLabelText('5 heat')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('formats large heat numbers — 1200 → "1.2k"', () => {
    mockFetchVote(1200, null)
    render(
      <VoteButtons resourceId="drop-1" initialHeat={1200} initialUserVote={null} />,
    )
    expect(screen.getByText('1.2k')).toBeInTheDocument()
  })

  it('boost button is not active when userVote is null', () => {
    mockFetchVote(5, null)
    render(
      <VoteButtons resourceId="drop-1" initialHeat={5} initialUserVote={null} />,
    )
    const boostBtn = screen.getByRole('button', { name: /boost this drop/i })
    expect(boostBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking Boost optimistically increments heat to 6', async () => {
    const user = userEvent.setup()
    mockFetchVote(6, 1)
    render(
      <VoteButtons resourceId="drop-1" initialHeat={5} initialUserVote={null} />,
    )
    await user.click(screen.getByRole('button', { name: /boost this drop/i }))
    // Optimistic update shows 6 immediately
    await waitFor(() => expect(screen.getByText('6')).toBeInTheDocument())
  })

  it('clicking Boost twice toggles vote off — heat returns to 5', async () => {
    const user = userEvent.setup()
    // First click resolves with heat=6, userVote=1
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ heat: 6, userVote: 1 }) })
      // Second click resolves with heat=5, userVote=null (toggle off)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ heat: 5, userVote: null }) })

    render(
      <VoteButtons resourceId="drop-1" initialHeat={5} initialUserVote={null} />,
    )
    const boostBtn = screen.getByRole('button', { name: /boost this drop/i })
    await user.click(boostBtn)
    await waitFor(() => expect(screen.getByText('6')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /remove boost/i }))
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument())
  })

  it('clicking Bury decrements heat to 4 and marks bury active', async () => {
    const user = userEvent.setup()
    mockFetchVote(4, -1)
    render(
      <VoteButtons resourceId="drop-1" initialHeat={5} initialUserVote={null} />,
    )
    await user.click(screen.getByRole('button', { name: /bury this drop/i }))
    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument())
    const buryBtn = screen.getByRole('button', { name: /remove bury/i })
    expect(buryBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('flipping from Bury to Boost swings heat by +2', async () => {
    const user = userEvent.setup()
    // Start already buried (heat=4, userVote=-1)
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ heat: 6, userVote: 1 }) })

    render(
      <VoteButtons resourceId="drop-1" initialHeat={4} initialUserVote={-1} />,
    )
    // Optimistically: heat goes 4 → 4 - (-1) + 1 = 6
    await user.click(screen.getByRole('button', { name: /boost this drop/i }))
    await waitFor(() => expect(screen.getByText('6')).toBeInTheDocument())
  })

  it('unauthenticated user clicking Boost redirects to /login', async () => {
    vi.mocked(useSession).mockReturnValue({
      data: null as any,
      status: 'unauthenticated',
      update: vi.fn(),
    })
    global.fetch = vi.fn()
    const user = userEvent.setup()
    render(
      <VoteButtons resourceId="drop-1" initialHeat={5} initialUserVote={null} />,
    )
    await user.click(screen.getByRole('button', { name: /boost this drop/i }))
    expect(mockPush).toHaveBeenCalledWith('/login')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('API failure reverts optimistic update', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    render(
      <VoteButtons resourceId="drop-1" initialHeat={5} initialUserVote={null} />,
    )
    await user.click(screen.getByRole('button', { name: /boost this drop/i }))
    // After optimistic increment (6), reverts to 5 on failure
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument())
  })

  it('renders reply resource label for reply target', () => {
    mockFetchVote(3, null)
    render(
      <VoteButtons resourceId="reply-1" initialHeat={3} initialUserVote={null} target="reply" />,
    )
    expect(screen.getByRole('button', { name: /boost this reply/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /bury this reply/i })).toBeInTheDocument()
  })
})
