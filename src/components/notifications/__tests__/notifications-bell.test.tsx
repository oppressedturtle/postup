import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationsBell } from '../notifications-bell'

// next/link stub needed for notification list items
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
  }: {
    children: React.ReactNode
    href: string
    onClick?: () => void
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}))

function makeNotification(id: string, read = false) {
  return {
    id,
    type: 'REPLY_TO_DROP' as const,
    read,
    payload: { dropId: 'drop-1', replyId: 'reply-1', replierHandle: 'alice' },
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  }
}

describe('NotificationsBell', () => {
  beforeEach(() => {
    // Use real timers — fake timers conflict with resolved Promises in jsdom
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the bell button', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unread: 0 }),
    })
    render(<NotificationsBell />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument(),
    )
  })

  it('shows no badge when unread count is 0', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unread: 0 }),
    })
    render(<NotificationsBell />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^notifications$/i })).toBeInTheDocument(),
    )
    // Badge element only renders when hasUnread=true
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows badge "3" when unread count is 3', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unread: 3 }),
    })
    render(<NotificationsBell />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
    expect(screen.getByLabelText(/3 unread/i)).toBeInTheDocument()
  })

  it('shows badge "99+" when unread count is 100', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unread: 100 }),
    })
    render(<NotificationsBell />)
    await waitFor(() => expect(screen.getByText('99+')).toBeInTheDocument())
  })

  it('clicking bell opens the notifications dropdown panel', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ unread: 3 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          notifications: [makeNotification('n-1'), makeNotification('n-2')],
        }),
      })

    render(<NotificationsBell />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /notifications/i }))

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /notifications/i })).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(screen.getAllByText(/u\/alice replied to your drop/i)).toHaveLength(2),
    )
  })

  it('shows empty state when no notifications', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ unread: 0 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ notifications: [] }) })

    render(<NotificationsBell />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^notifications$/i })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /notifications/i }))

    await waitFor(() =>
      expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument(),
    )
  })

  it('"Mark all read" calls PATCH endpoint and removes badge', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ unread: 3 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ notifications: [makeNotification('n-1', false)] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // PATCH response

    render(<NotificationsBell />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /notifications/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mark all read/i })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /mark all read/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/notifications',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"all":true'),
        }),
      ),
    )
    // Unread badge disappears after mark-all-read
    await waitFor(() => expect(screen.queryByText('3')).not.toBeInTheDocument())
  })

  it('pressing Escape closes the dropdown', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ unread: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ notifications: [] }) })

    render(<NotificationsBell />)
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /notifications/i }))
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /notifications/i })).toBeInTheDocument(),
    )

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /notifications/i })).not.toBeInTheDocument(),
    )
  })
})
