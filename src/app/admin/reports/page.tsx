'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminReport {
  id: string;
  reason: string;
  details: string | null;
  createdAt: string;
  reporter: { handle: string; avatar: string | null };
  drop: {
    id: string;
    title: string;
    body: string | null;
    isRemoved: boolean;
    hub: { slug: string; name: string };
  } | null;
  reply: {
    id: string;
    body: string;
    isRemoved: boolean;
    drop: { id: string; title: string; hub: { slug: string; name: string } };
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    SPAM: 'Spam',
    HARASSMENT: 'Harassment',
    HATE_SPEECH: 'Hate Speech',
    MISINFORMATION: 'Misinformation',
    NSFW_CONTENT: 'NSFW Content',
    OTHER: 'Other',
  };
  return labels[reason] ?? reason;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ---------------------------------------------------------------------------
// AdminReportsPage
// ---------------------------------------------------------------------------

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void fetchReports();
  }, []);

  async function fetchReports(cursor?: string) {
    if (!cursor) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const url = `/api/admin/reports${cursor ? `?cursor=${cursor}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load reports');
      const data = (await res.json()) as { reports: AdminReport[]; nextCursor: string | null };

      if (cursor) {
        setReports((prev) => [...prev, ...data.reports]);
      } else {
        setReports(data.reports);
      }
      setNextCursor(data.nextCursor);
    } catch {
      setError('Failed to load reports. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function handleAction(reportId: string, action: 'resolve' | 'dismiss') {
    setActing((prev) => ({ ...prev, [reportId]: true }));
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
      }
    } catch {
      // silent
    } finally {
      setActing((prev) => ({ ...prev, [reportId]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">Reports</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          All pending reports site-wide.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[rgb(var(--border))]" aria-hidden="true" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button
            type="button"
            onClick={() => void fetchReports()}
            className="mt-2 text-sm text-brand-500 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-10 text-center">
          <p className="text-sm font-medium text-[rgb(var(--fg))]">No pending reports</p>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">PostUp is looking clean.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const hubInfo = report.drop?.hub ?? report.reply?.drop?.hub ?? null;
            const dropId = report.drop?.id ?? report.reply?.drop?.id ?? null;
            const contentLabel = report.drop
              ? report.drop.title
              : report.reply
                ? report.reply.body.slice(0, 120)
                : 'Unknown content';
            const isActing = acting[report.id] ?? false;

            return (
              <div
                key={report.id}
                className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-500">
                        {reasonLabel(report.reason)}
                      </span>
                      {hubInfo && (
                        <Link
                          href={`/h/${hubInfo.slug}`}
                          className="text-xs text-[rgb(var(--muted))] hover:text-brand-500 transition-colors"
                        >
                          h/{hubInfo.slug}
                        </Link>
                      )}
                    </div>

                    <p className="mt-2 text-sm text-[rgb(var(--fg))]">
                      {dropId ? (
                        <Link href={`/drops/${dropId}`} className="hover:text-brand-500 transition-colors">
                          {contentLabel.length > 150 ? contentLabel.slice(0, 150) + '…' : contentLabel}
                        </Link>
                      ) : (
                        <span>
                          {contentLabel.length > 150 ? contentLabel.slice(0, 150) + '…' : contentLabel}
                        </span>
                      )}
                    </p>

                    {report.details && (
                      <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                        &ldquo;{report.details}&rdquo;
                      </p>
                    )}

                    <p className="mt-2 text-xs text-[rgb(var(--muted))]">
                      Reported by u/{report.reporter.handle} &middot; {relativeTime(report.createdAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => void handleAction(report.id, 'resolve')}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      Remove &amp; Resolve
                    </button>
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => void handleAction(report.id, 'dismiss')}
                      className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--fg))] hover:bg-[rgb(var(--border))] transition-colors disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {nextCursor && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => void fetchReports(nextCursor)}
                disabled={loadingMore}
                className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-5 py-2 text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:border-brand-500/50 transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
