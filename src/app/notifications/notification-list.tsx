'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationPayload {
  dropId?: string;
  replyId?: string;
  parentReplyId?: string;
  replierHandle?: string;
  mentionerHandle?: string;
  boostedBy?: string;
}

interface Notification {
  id: string;
  type: 'REPLY_TO_DROP' | 'REPLY_TO_REPLY' | 'MENTION' | 'DROP_BOOSTED';
  read: boolean;
  payload: NotificationPayload;
  createdAt: string;
}

interface Props {
  initialNotifications: Notification[];
  initialNextCursor: string | null;
  initialUnreadCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const diffDays = Math.floor(
    (now.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) /
      (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return 'Earlier';
}

function getDescription(notification: Notification): string {
  const p = notification.payload;
  switch (notification.type) {
    case 'REPLY_TO_DROP':
      return `u/${p.replierHandle ?? 'someone'} replied to your Drop`;
    case 'REPLY_TO_REPLY':
      return `u/${p.replierHandle ?? 'someone'} replied to your reply`;
    case 'MENTION':
      return `u/${p.mentionerHandle ?? 'someone'} mentioned you`;
    case 'DROP_BOOSTED':
      return `u/${p.boostedBy ?? 'someone'} boosted your Drop`;
    default:
      return 'New notification';
  }
}

function getLink(notification: Notification): string {
  const p = notification.payload;
  if (p.dropId) {
    return `/drops/${p.dropId}${p.replyId ? `#reply-${p.replyId}` : '#replies'}`;
  }
  return '/';
}

function NotificationIcon({ type }: { type: Notification['type'] }) {
  switch (type) {
    case 'REPLY_TO_DROP':
    case 'REPLY_TO_REPLY':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-brand-500">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'MENTION':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-indigo-500">
          <circle cx="12" cy="12" r="4" />
          <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
        </svg>
      );
    case 'DROP_BOOSTED':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-brand-500">
          <path d="M12 4l8 14H4z" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// NotificationList
// ---------------------------------------------------------------------------

export function NotificationList({
  initialNotifications,
  initialNextCursor,
  initialUnreadCount,
}: Props) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const markTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mark visible unread notifications as read after 2s delay
  useEffect(() => {
    const unreadIds = notifications
      .filter((n) => !n.read)
      .map((n) => n.id);

    if (unreadIds.length === 0) return;

    markTimerRef.current = setTimeout(() => {
      void markRead(unreadIds);
    }, 2000);

    return () => {
      if (markTimerRef.current) clearTimeout(markTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markRead(ids: string[]) {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
      );
      setUnreadCount(0);
    } catch {
      // Silent
    }
  }

  async function handleMarkAllRead() {
    setMarkingRead(true);
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch {
      // Silent
    } finally {
      setMarkingRead(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/notifications?cursor=${nextCursor}&limit=20`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: Notification[];
        nextCursor: string | null;
      };
      setNotifications((prev) => [...prev, ...data.notifications]);
      setNextCursor(data.nextCursor);
    } catch {
      // Silent
    } finally {
      setLoadingMore(false);
    }
  }

  // Group by date
  const groups: { label: string; items: Notification[] }[] = [];
  const groupOrder = ['Today', 'Yesterday', 'Earlier'];
  const groupMap = new Map<string, Notification[]>();

  for (const n of notifications) {
    const label = getDateGroup(n.createdAt);
    if (!groupMap.has(label)) groupMap.set(label, []);
    groupMap.get(label)!.push(n);
  }

  for (const label of groupOrder) {
    const items = groupMap.get(label);
    if (items && items.length > 0) {
      groups.push({ label, items });
    }
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
          className="text-[rgb(var(--muted))]"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <p className="font-medium text-[rgb(var(--fg))]">You&rsquo;re all caught up!</p>
        <p className="text-sm text-[rgb(var(--muted))]">No notifications yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            disabled={markingRead}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-500 hover:bg-brand-500/10 transition-colors disabled:opacity-50"
          >
            {markingRead ? 'Marking…' : 'Mark all read'}
          </button>
        </div>
      )}

      {/* Grouped notifications */}
      <div className="space-y-6">
        {groups.map(({ label, items }) => (
          <section key={label} aria-labelledby={`notif-group-${label.toLowerCase()}`}>
            <h2
              id={`notif-group-${label.toLowerCase()}`}
              className="mb-2 text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]"
            >
              {label}
            </h2>
            <ul
              role="list"
              className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] overflow-hidden"
            >
              {items.map((notification) => (
                <li key={notification.id}>
                  <Link
                    href={getLink(notification)}
                    className={[
                      'flex items-start gap-4 px-4 py-4 transition-colors hover:bg-brand-500/5',
                      !notification.read ? 'bg-brand-500/[0.03]' : '',
                    ].join(' ')}
                  >
                    {/* Icon */}
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--border))]">
                      <NotificationIcon type={notification.type} />
                    </span>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p
                        className={[
                          'text-sm leading-snug',
                          !notification.read
                            ? 'font-medium text-[rgb(var(--fg))]'
                            : 'text-[rgb(var(--muted))]',
                        ].join(' ')}
                      >
                        {getDescription(notification)}
                      </p>
                      <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                        {relativeTime(notification.createdAt)}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!notification.read && (
                      <span
                        aria-label="Unread"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                      />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Load more */}
      {nextCursor && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-2 text-sm font-medium text-[rgb(var(--fg))] hover:border-brand-500/50 hover:text-brand-500 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
