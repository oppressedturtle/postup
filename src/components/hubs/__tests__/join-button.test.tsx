import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSession } from 'next-auth/react'
import { JoinButton } from '../join-button'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

describe('JoinButton', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: 'user-1', handle: 'testuser', email: 'test@example.com', role: 'MEMBER' as const, clout: 0 }, expires: '' },
      status: 'authenticated',
      update: vi.fn(),
    })
    mockPush.mockClear()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
  })

  it('renders "Join" when not a member', () => {
    render(
      <JoinButton hubSlug="gaming" initialIsMember={false} initialMemberCount={100} />,
    )
    expect(screen.getByRole('button', { name: /join h\/gaming/i })).toBeInTheDocument()
    expect(screen.getByText('Join')).toBeInTheDocument()
  })

  it('renders "Joined" when already a member', () => {
    render(
      <JoinButton hubSlug="gaming" initialIsMember={true} initialMemberCount={101} />,
    )
    expect(screen.getByRole('button', { name: /leave h\/gaming/i })).toBeInTheDocument()
    expect(screen.getByText('Joined')).toBeInTheDocument()
  })

  it('clicking Join triggers optimistic update and calls API', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    render(
      <JoinButton hubSlug="gaming" initialIsMember={false} initialMemberCount={100} />,
    )
    await user.click(screen.getByRole('button', { name: /join h\/gaming/i }))

    // Optimistically becomes "Joined"
    await waitFor(() => expect(screen.getByText('Joined')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/hubs/gaming/membership',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('clicking Leave (member=true) optimistically shows "Join" then calls DELETE', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) })

    render(
      <JoinButton hubSlug="gaming" initialIsMember={true} initialMemberCount={101} />,
    )
    await user.click(screen.getByRole('button', { name: /leave h\/gaming/i }))
    await waitFor(() => expect(screen.getByText('Join')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/hubs/gaming/membership',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('API failure reverts optimistic update and shows error', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Server error' } }),
    })

    render(
      <JoinButton hubSlug="gaming" initialIsMember={false} initialMemberCount={100} />,
    )
    await user.click(screen.getByRole('button', { name: /join h\/gaming/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Server error'),
    )
    // Reverted to "Join"
    expect(screen.getByText('Join')).toBeInTheDocument()
  })

  it('network error reverts optimistic update and shows error', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'))

    render(
      <JoinButton hubSlug="gaming" initialIsMember={false} initialMemberCount={100} />,
    )
    await user.click(screen.getByRole('button', { name: /join h\/gaming/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/network error/i),
    )
    expect(screen.getByText('Join')).toBeInTheDocument()
  })

  it('unauthenticated user clicking Join redirects to /login', async () => {
    vi.mocked(useSession).mockReturnValue({
      data: null as any,
      status: 'unauthenticated',
      update: vi.fn(),
    })
    global.fetch = vi.fn()
    const user = userEvent.setup()
    render(
      <JoinButton hubSlug="gaming" initialIsMember={false} initialMemberCount={100} />,
    )
    await user.click(screen.getByRole('button', { name: /join h\/gaming/i }))
    expect(mockPush).toHaveBeenCalledWith('/login')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
