'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportButtonProps {
  dropId?: string;
  replyId?: string;
}

type ReportReason =
  | 'SPAM'
  | 'HARASSMENT'
  | 'HATE_SPEECH'
  | 'MISINFORMATION'
  | 'NSFW_CONTENT'
  | 'OTHER';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'HARASSMENT', label: 'Harassment' },
  { value: 'HATE_SPEECH', label: 'Hate Speech' },
  { value: 'MISINFORMATION', label: 'Misinformation' },
  { value: 'NSFW_CONTENT', label: 'NSFW Content' },
  { value: 'OTHER', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Focus trap hook
// ---------------------------------------------------------------------------

function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;

    const focusableSelectors =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    function getFocusable(): HTMLElement[] {
      return Array.from(el!.querySelectorAll<HTMLElement>(focusableSelectors));
    }

    // Focus first focusable element
    const focusable = getFocusable();
    focusable[0]?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const focusableEls = getFocusable();
      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];
      if (!first || !last) return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active]);

  return containerRef;
}

// ---------------------------------------------------------------------------
// ReportButton
// ---------------------------------------------------------------------------

export function ReportButton({ dropId, replyId }: ReportButtonProps) {
  const { data: session } = useSession();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('SPAM');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'duplicate' | 'error'>('idle');

  const dialogRef = useFocusTrap(open);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleOpen() {
    if (!session?.user) {
      router.push('/login');
      return;
    }
    setOpen(true);
    setStatus('idle');
    setReason('SPAM');
    setDetails('');
  }

  function handleClose() {
    setOpen(false);
    // Return focus to trigger
    setTimeout(() => triggerRef.current?.focus(), 0);
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) handleClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(dropId ? { dropId } : {}),
          ...(replyId ? { replyId } : {}),
          reason,
          details: details.trim() || undefined,
        }),
      });

      if (res.status === 409) {
        setStatus('duplicate');
        return;
      }
      if (!res.ok) {
        setStatus('error');
        return;
      }
      setStatus('success');
      setTimeout(() => handleClose(), 2000);
    } catch {
      setStatus('error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))] hover:text-[rgb(var(--fg))] transition-colors"
        aria-label="Report this content"
      >
        {/* Flag icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        Report
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Dialog */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2
                id="report-dialog-title"
                className="text-base font-semibold text-[rgb(var(--fg))]"
              >
                Report this content
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close dialog"
                className="rounded-md p-1 text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))] hover:text-[rgb(var(--fg))] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {status === 'success' ? (
              <div className="py-6 text-center">
                <p className="text-sm font-medium text-[rgb(var(--fg))]">
                  Thanks, we&apos;ll review this.
                </p>
              </div>
            ) : status === 'duplicate' ? (
              <div className="py-6 text-center">
                <p className="text-sm text-[rgb(var(--muted))]">
                  You&apos;ve already reported this content.
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-3 text-sm text-brand-500 hover:underline"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                {/* Reason radios */}
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-[rgb(var(--fg))]">
                    Reason
                  </legend>
                  <div className="space-y-2">
                    {REASONS.map((r) => (
                      <label
                        key={r.value}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[rgb(var(--fg))] hover:bg-[rgb(var(--border))] transition-colors"
                      >
                        <input
                          type="radio"
                          name="reason"
                          value={r.value}
                          checked={reason === r.value}
                          onChange={() => setReason(r.value)}
                          className="accent-brand-500"
                        />
                        {r.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {/* Details */}
                <div>
                  <label
                    htmlFor="report-details"
                    className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]"
                  >
                    Additional details{' '}
                    <span className="font-normal text-[rgb(var(--muted))]">(optional)</span>
                  </label>
                  <textarea
                    id="report-details"
                    value={details}
                    onChange={(e) => setDetails(e.target.value.slice(0, 500))}
                    maxLength={500}
                    rows={3}
                    placeholder="Provide any additional context…"
                    className="w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <p className="mt-1 text-right text-xs text-[rgb(var(--muted))]">
                    {details.length}/500
                  </p>
                </div>

                {status === 'error' && (
                  <p className="text-sm text-red-500">
                    Something went wrong. Please try again.
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm text-[rgb(var(--fg))] hover:bg-[rgb(var(--border))] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Submitting…' : 'Submit Report'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </>
  );
}
