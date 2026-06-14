'use client';

import { useRef, useState } from 'react';
import type { Reply } from '@/types/reply';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplyFormProps {
  dropId: string;
  parentId?: string;
  onSuccess: (reply: Reply) => void;
  onCancel: () => void;
  /** Placeholder text for the textarea */
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// ReplyForm
// ---------------------------------------------------------------------------

const MAX_CHARS = 10_000;

export function ReplyForm({
  dropId,
  parentId,
  onSuccess,
  onCancel,
  placeholder = 'Write a reply…',
}: ReplyFormProps) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const remaining = MAX_CHARS - body.length;
  const isOverLimit = remaining < 0;
  const isEmpty = body.trim().length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEmpty || isOverLimit || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/drops/${dropId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), ...(parentId ? { parentId } : {}) }),
      });

      if (res.status === 429) {
        const data = (await res.json()) as { error?: { message?: string } };
        setError(
          data.error?.message ??
            'You are posting replies too fast. Please wait before trying again.',
        );
        return;
      }

      if (res.status === 403) {
        const data = (await res.json()) as { error?: { message?: string } };
        setError(data.error?.message ?? 'You must be a member of this hub to reply.');
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        setError(data.error?.message ?? 'Failed to post reply. Please try again.');
        return;
      }

      const data = (await res.json()) as { reply: Reply };
      setBody('');
      onSuccess(data.reply);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    setBody('');
    setError(null);
    onCancel();
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setError(null);
          }}
          placeholder={placeholder}
          rows={4}
          maxLength={MAX_CHARS + 100} /* allow slight overflow so we can show the counter */
          aria-label="Reply body"
          aria-describedby={error ? 'reply-form-error' : undefined}
          className={[
            'w-full resize-y rounded-lg border px-3 py-2.5 text-sm',
            'bg-[rgb(var(--card))] text-[rgb(var(--fg))]',
            'placeholder:text-[rgb(var(--muted))]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
            'transition-colors',
            isOverLimit
              ? 'border-red-500 focus-visible:ring-red-500'
              : 'border-[rgb(var(--border))]',
          ].join(' ')}
        />
        {/* Character counter */}
        <span
          aria-live="polite"
          className={[
            'absolute bottom-2 right-3 text-xs tabular-nums',
            isOverLimit
              ? 'text-red-500 font-semibold'
              : remaining < 500
                ? 'text-[rgb(var(--muted))]'
                : 'sr-only',
          ].join(' ')}
        >
          {remaining.toLocaleString()}
        </span>
      </div>

      {/* Error message */}
      {error && (
        <p id="reply-form-error" role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="rounded-lg px-3 py-1.5 text-sm text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))] transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isEmpty || isOverLimit || submitting}
          className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Posting…' : 'Reply'}
        </button>
      </div>
    </form>
  );
}
