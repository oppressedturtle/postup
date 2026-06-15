import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSession } from 'next-auth/react'
import { StashButton } from '../stash-button'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

describe('StashButton', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: 'user-1', handle: 'testuser', email: 'test@example.com', role: 'MEMBER' as const, clout: 0 }, expires: '' },
      status: 'authenticated',
      update: vi.fn(),
    })
    mockPush.mockClear()
  })

  it('renders unfilled bookmark when not stashed', () => {
    render(<StashButton dropId="drop-1" initialStashed={false} />)
    const btn = screen.getByRole('button', { name: /save to stash/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders filled bookmark state when stashed', () => {
    render(<StashButton dropId="drop-1" initialStashed={true} />)
    const btn = screen.getByRole('button', { name: /remove from stash/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking stash button optimistically toggles to stashed state', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<StashButton dropId="drop-1" initialStashed={false} />)

    await user.click(screen.getByRole('button', { name: /save to stash/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /remove from stash/i })).toBeInTheDocument(),
    )
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/drops/drop-1/stash',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('clicking stashed button optimistically toggles off', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<StashButton dropId="drop-1" initialStashed={true} />)

    await user.click(screen.getByRole('button', { name: /remove from stash/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save to stash/i })).toBeInTheDocument(),
    )
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/drops/drop-1/stash',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('API error reverts optimistic toggle', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<StashButton dropId="drop-1" initialStashed={false} />)

    await user.click(screen.getByRole('button', { name: /save to stash/i }))

    // Reverts back to unstashed
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save to stash/i })).toBeInTheDocument(),
    )
  })

  it('network error reverts optimistic toggle', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    render(<StashButton dropId="drop-1" initialStashed={false} />)

    await user.click(screen.getByRole('button', { name: /save to stash/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save to stash/i })).toBeInTheDocument(),
    )
  })

  it('unauthenticated user clicking stash redirects to /login', async () => {
    vi.mocked(useSession).mockReturnValue({
      data: null as any,
      status: 'unauthenticated',
      update: vi.fn(),
    })
    global.fetch = vi.fn()
    const user = userEvent.setup()
    render(<StashButton dropId="drop-1" initialStashed={false} />)

    await user.click(screen.getByRole('button', { name: /save to stash/i }))
    expect(mockPush).toHaveBeenCalledWith('/login')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
