import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReplyForm } from '../reply-form'
import type { Reply } from '@/types/reply'

const mockReply: Reply = {
  id: 'reply-1',
  body: 'A great reply',
  isRemoved: false,
  heat: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  parentId: null,
  author: { handle: 'testuser', avatar: null, clout: 0 },
  _count: { children: 0 },
}

describe('ReplyForm', () => {
  const onSuccess = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    onSuccess.mockClear()
    onCancel.mockClear()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: mockReply }),
    })
  })

  it('renders textarea and action buttons', () => {
    render(<ReplyForm dropId="drop-1" onSuccess={onSuccess} onCancel={onCancel} />)
    expect(screen.getByRole('textbox', { name: /reply body/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reply/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('submit button is disabled when textarea is empty', () => {
    render(<ReplyForm dropId="drop-1" onSuccess={onSuccess} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: /^reply$/i })).toBeDisabled()
  })

  it('typing text enables submit button', async () => {
    const user = userEvent.setup()
    render(<ReplyForm dropId="drop-1" onSuccess={onSuccess} onCancel={onCancel} />)
    await user.type(screen.getByRole('textbox', { name: /reply body/i }), 'Hello world')
    expect(screen.getByRole('button', { name: /^reply$/i })).not.toBeDisabled()
  })

  it('clicking Cancel calls onCancel callback', async () => {
    const user = userEvent.setup()
    render(<ReplyForm dropId="drop-1" onSuccess={onSuccess} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('submitting empty form does not call fetch', async () => {
    const user = userEvent.setup()
    render(<ReplyForm dropId="drop-1" onSuccess={onSuccess} onCancel={onCancel} />)
    // Submit button is disabled so direct form submission via Enter
    const textarea = screen.getByRole('textbox', { name: /reply body/i })
    await user.click(textarea)
    await user.keyboard('{Enter}')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('successful submit calls fetch with correct body and invokes onSuccess', async () => {
    const user = userEvent.setup()
    render(<ReplyForm dropId="drop-1" onSuccess={onSuccess} onCancel={onCancel} />)

    await user.type(screen.getByRole('textbox', { name: /reply body/i }), 'My reply text')
    await user.click(screen.getByRole('button', { name: /^reply$/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(mockReply))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/drops/drop-1/replies',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"body":"My reply text"'),
      }),
    )
  })

  it('includes parentId in request body when provided', async () => {
    const user = userEvent.setup()
    render(
      <ReplyForm
        dropId="drop-1"
        parentId="parent-reply-1"
        onSuccess={onSuccess}
        onCancel={onCancel}
      />,
    )
    await user.type(screen.getByRole('textbox', { name: /reply body/i }), 'Nested reply')
    await user.click(screen.getByRole('button', { name: /^reply$/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/drops/drop-1/replies',
      expect.objectContaining({
        body: expect.stringContaining('"parentId":"parent-reply-1"'),
      }),
    )
  })

  it('429 response shows rate limit error inline', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: { message: 'You are posting replies too fast. Please wait before trying again.' },
      }),
    })
    const user = userEvent.setup()
    render(<ReplyForm dropId="drop-1" onSuccess={onSuccess} onCancel={onCancel} />)

    await user.type(screen.getByRole('textbox', { name: /reply body/i }), 'Spam reply')
    await user.click(screen.getByRole('button', { name: /^reply$/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/posting replies too fast/i),
    )
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('403 response shows membership error inline', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: { message: 'You must be a member of this hub to reply.' },
      }),
    })
    const user = userEvent.setup()
    render(<ReplyForm dropId="drop-1" onSuccess={onSuccess} onCancel={onCancel} />)

    await user.type(screen.getByRole('textbox', { name: /reply body/i }), 'Reply attempt')
    await user.click(screen.getByRole('button', { name: /^reply$/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/must be a member/i),
    )
  })

  it('network error shows connection error message', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'))
    const user = userEvent.setup()
    render(<ReplyForm dropId="drop-1" onSuccess={onSuccess} onCancel={onCancel} />)

    await user.type(screen.getByRole('textbox', { name: /reply body/i }), 'Some text')
    await user.click(screen.getByRole('button', { name: /^reply$/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/network error/i),
    )
  })

  it('clears textarea and calls onSuccess on successful submit', async () => {
    const user = userEvent.setup()
    render(<ReplyForm dropId="drop-1" onSuccess={onSuccess} onCancel={onCancel} />)

    const textarea = screen.getByRole('textbox', { name: /reply body/i })
    await user.type(textarea, 'Some text')
    await user.click(screen.getByRole('button', { name: /^reply$/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(textarea).toHaveValue('')
  })
})
