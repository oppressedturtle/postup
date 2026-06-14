'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModLogEntry {
  id: string;
  action: string;
  reason: string | null;
  targetUserId: string | null;
  dropId: string | null;
  replyId: string | null;
  reportId: string | null;
  createdAt: string;
  moderator: { handle: string; avatar: string | null; displayName: string };
}

interface ModLogTabProps {
  hubSlug: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    REMOVE_DROP: 'Removed drop',
    RESTORE_DROP: 'Restored drop',
    PIN_DROP: 'Pinned drop',
    UNPIN_DROP: 'Unpinned drop',
    LOCK_DROP: 'Locked drop',
    UNLOCK_DROP: 'Unlocked drop',
    REMOVE_REPLY: 'Removed reply',
    RESTORE_REPLY: 'Restored reply',
    BAN_USER: 'Banned user',
    UNBAN_USER: 'Unbanned user',
    RESOLVE_REPORT: 'Resolved report',
    DISMISS_REPORT: 'Dismissed report',
  };
  return labels[action] ?? action;
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
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// ---------------------------------------------------------------------------
// ModLogTab
// ---------------------------------------------------------------------------

export function ModLogTab({ hubSlug }: ModLogTabProps) {
  const [logs, setLogs] = useState<ModLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(
    async (cursor?: string) => {
      if (!cursor) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const url = `/api/hubs/${hubSlug}/mod-log?limit=20${cursor ? `&cursor=${cursor}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load mod log');
        const data = (await res.json()) as { logs: ModLogEntry[]; nextCursor: string | null };

        if (cursor) {
          setLogs((prev) => [...prev, ...data.logs]);
        } else {
          setLogs(data.logs);
        }
        setNextCursor(data.nextCursor);
      } catch {
        setError('Failed to load mod log. Please try again.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [hubSlug],
  );

  useEffect(() => {
    void fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubSlug]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-[rgb(var(--border))]" aria-hidden="true" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 text-center">
        <p className="text-sm text-red-500">{error}</p>
        <button
          type="button"
          onClick={() => void fetchLogs()}
          className="mt-2 text-sm text-brand-500 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-10 text-center">
        <p className="text-sm text-[rgb(var(--muted))]">No moderation actions recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--border))] text-xs text-[rgb(var(--muted))]">
              <th className="px-4 py-3 text-left font-medium">Moderator</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
              <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Target</th>
              <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Reason</th>
              <th className="px-4 py-3 text-left font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-[rgb(var(--border))]/30 transition-colors">
                <td className="px-4 py-3">
                  <span className="font-medium text-[rgb(var(--fg))]">
                    u/{log.moderator.handle}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-[rgb(var(--fg))]">{actionLabel(log.action)}</span>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  {log.dropId && (
                    <Link
                      href={`/drops/${log.dropId}`}
                      className="text-brand-500 hover:underline"
                    >
                      Drop
                    </Link>
                  )}
                  {log.replyId && (
                    <span className="text-[rgb(var(--muted))]">Reply</span>
                  )}
                  {!log.dropId && !log.replyId && (
                    <span className="text-[rgb(var(--muted))]">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  <span className="text-[rgb(var(--muted))] line-clamp-1">
                    {log.reason ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-[rgb(var(--muted))]">
                  {relativeTime(log.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => void fetchLogs(nextCursor)}
            disabled={loadingMore}
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-5 py-2 text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:border-brand-500/50 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
