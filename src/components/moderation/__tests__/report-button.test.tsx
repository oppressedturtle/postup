import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSession } from 'next-auth/react'
import { ReportButton } from '../report-button'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

describe('ReportButton', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: 'user-1', handle: 'testuser', email: 'test@example.com', role: 'MEMBER' as const, clout: 0 }, expires: '' },
      status: 'authenticated',
      update: vi.fn(),
    })
    mockPush.mockClear()
  })

  it('renders the Report button', () => {
    render(<ReportButton dropId="drop-1" />)
    expect(screen.getByRole('button', { name: /report this content/i })).toBeInTheDocument()
  })

  it('clicking Report opens the dialog', async () => {
    const user = userEvent.setup()
    render(<ReportButton dropId="drop-1" />)

    await user.click(screen.getByRole('button', { name: /report this content/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/report this content/i, { selector: 'h2' })).toBeInTheDocument()
  })

  it('dialog contains reason radio buttons', async () => {
    const user = userEvent.setup()
    render(<ReportButton dropId="drop-1" />)

    await user.click(screen.getByRole('button', { name: /report this content/i }))

    expect(screen.getByRole('radio', { name: /spam/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /harassment/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /hate speech/i })).toBeInTheDocument()
  })

  it('submit button is enabled because a reason is pre-selected (Spam)', async () => {
    const user = userEvent.setup()
    render(<ReportButton dropId="drop-1" />)

    await user.click(screen.getByRole('button', { name: /report this content/i }))

    // Default reason is SPAM — submit should be enabled immediately
    const submitBtn = screen.getByRole('button', { name: /submit report/i })
    expect(submitBtn).not.toBeDisabled()
  })

  it('selecting a reason and submitting calls /api/reports', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    render(<ReportButton dropId="drop-1" />)

    await user.click(screen.getByRole('button', { name: /report this content/i }))
    await user.click(screen.getByRole('radio', { name: /harassment/i }))
    await user.click(screen.getByRole('button', { name: /submit report/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/reports',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"reason":"HARASSMENT"'),
        }),
      ),
    )
  })

  it('successful submit shows confirmation and closes dialog', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    render(<ReportButton dropId="drop-1" />)

    await user.click(screen.getByRole('button', { name: /report this content/i }))
    await user.click(screen.getByRole('button', { name: /submit report/i }))

    await waitFor(() =>
      expect(screen.getByText(/thanks, we'll review this/i)).toBeInTheDocument(),
    )
  })

  it('409 response shows "already reported" message', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({}),
    })
    render(<ReportButton dropId="drop-1" />)

    await user.click(screen.getByRole('button', { name: /report this content/i }))
    await user.click(screen.getByRole('button', { name: /submit report/i }))

    await waitFor(() =>
      expect(screen.getByText(/you've already reported this content/i)).toBeInTheDocument(),
    )
  })

  it('pressing Escape closes the dialog', async () => {
    const user = userEvent.setup()
    render(<ReportButton dropId="drop-1" />)

    await user.click(screen.getByRole('button', { name: /report this content/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })

  it('Cancel button closes the dialog', async () => {
    const user = userEvent.setup()
    render(<ReportButton dropId="drop-1" />)

    await user.click(screen.getByRole('button', { name: /report this content/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })

  it('unauthenticated user clicking Report redirects to /login', async () => {
    vi.mocked(useSession).mockReturnValue({
      data: null as any,
      status: 'unauthenticated',
      update: vi.fn(),
    })
    const user = userEvent.setup()
    render(<ReportButton dropId="drop-1" />)

    await user.click(screen.getByRole('button', { name: /report this content/i }))
    expect(mockPush).toHaveBeenCalledWith('/login')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
