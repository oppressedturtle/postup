'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const MDEditor = dynamic(
  () => import('@uiw/react-md-editor').then((m) => m.default),
  { ssr: false },
);

interface EditDropFormProps {
  dropId: string;
  initialTitle: string;
  initialBody: string;
}

export function EditDropForm({ dropId, initialTitle, initialBody }: EditDropFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const titleRemaining = 300 - title.length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      const res = await fetch(`/api/drops/${dropId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });

      if (!res.ok) {
        const data = (await res.json()) as {
          error?: { message?: string; details?: Record<string, string[]> };
        };
        if (data.error?.details) {
          setFieldErrors(data.error.details);
        } else {
          setError(data.error?.message ?? 'Something went wrong. Please try again.');
        }
        return;
      }

      router.push(`/drops/${dropId}`);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
      {/* Title */}
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="edit-title" className="block text-sm font-medium text-[rgb(var(--fg))]">
            Title <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <span
            aria-live="polite"
            className={`text-xs ${titleRemaining < 20 ? 'text-red-500' : 'text-[rgb(var(--muted))]'}`}
          >
            {titleRemaining}
          </span>
        </div>
        <input
          id="edit-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          required
          aria-describedby={fieldErrors.title ? 'edit-title-error' : undefined}
          className="mt-1 block w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        {fieldErrors.title && (
          <p id="edit-title-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {fieldErrors.title.join(', ')}
          </p>
        )}
      </div>

      {/* Body */}
      <div>
        <label className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]">
          Body
        </label>
        <div data-color-mode="auto" className="rounded-lg overflow-hidden border border-[rgb(var(--border))]">
          <MDEditor
            value={body}
            onChange={(val) => setBody(val ?? '')}
            height={280}
            preview="live"
            aria-label="Drop body (Markdown)"
          />
        </div>
        {fieldErrors.body && (
          <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {fieldErrors.body.join(', ')}
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-brand-500 px-6 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-[rgb(var(--border))] px-6 py-2 text-sm font-medium text-[rgb(var(--fg))] hover:bg-[rgb(var(--border))] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
