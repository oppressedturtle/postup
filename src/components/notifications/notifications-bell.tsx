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
  return `${d}d ago`;
}

function getNotificationDescription(notification: Notification): string {
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

function getNotificationLink(notification: Notification): string {
  const p = notification.payload;
  if (p.dropId) {
    return `/drops/${p.dropId}${p.replyId ? `#reply-${p.replyId}` : '#replies'}`;
  }
  return '/';
}

function getNotificationIcon(type: Notification['type']): React.ReactNode {
  switch (type) {
    case 'REPLY_TO_DROP':
    case 'REPLY_TO_REPLY':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-brand-500">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'MENTION':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-indigo-500">
          <circle cx="12" cy="12" r="4" />
          <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
        </svg>
      );
    case 'DROP_BOOSTED':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-brand-500">
          <path d="M12 4l8 14H4z" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Bell icon
// ---------------------------------------------------------------------------

function BellIcon({ hasUnread }: { hasUnread: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={hasUnread ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// NotificationsBell
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30_000;

export function NotificationsBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // ---------------------------------------------------------------------------
  // Poll unread count
  // ---------------------------------------------------------------------------

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/count');
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number };
      setUnreadCount(data.unread);
    } catch {
      // Silent — stale count stays
    }
  }, []);

  useEffect(() => {
    void fetchCount();
    const id = setInterval(() => void fetchCount(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchCount]);

  // ---------------------------------------------------------------------------
  // Open / close panel
  // ---------------------------------------------------------------------------

  async function togglePanel() {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);
    setLoadingPanel(true);
    try {
      const res = await fetch('/api/notifications?limit=10');
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: Notification[] };
      setNotifications(data.notifications);
    } catch {
      // Silent
    } finally {
      setLoadingPanel(false);
    }
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // ---------------------------------------------------------------------------
  // Mark all read
  // ---------------------------------------------------------------------------

  async function handleMarkAllRead() {
    setMarkingRead(true);
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    } catch {
      // Silent
    } finally {
      setMarkingRead(false);
    }
  }

  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);
  const hasUnread = unreadCount > 0;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => void togglePanel()}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={
          hasUnread
            ? `Notifications — ${displayCount} unread`
            : 'Notifications'
        }
        className={[
          'relative flex items-center justify-center rounded-lg p-2 transition-colors',
          'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:bg-brand-500/10',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        ].join(' ')}
      >
        <BellIcon hasUnread={hasUnread} />
        {hasUnread && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white"
          >
            {displayCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-1 w-80 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] shadow-lg"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
            <h2 className="text-sm font-semibold text-[rgb(var(--fg))]">Notifications</h2>
            {hasUnread && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                disabled={markingRead}
                className="text-xs text-brand-500 hover:underline disabled:opacity-50"
              >
                {markingRead ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* Panel body */}
          <div className="max-h-96 overflow-y-auto">
            {loadingPanel ? (
              <div className="space-y-2 p-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-[rgb(var(--border))]" aria-hidden="true" />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-[rgb(var(--muted))]">No notifications yet.</p>
              </div>
            ) : (
              <ul role="list">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <Link
                      href={getNotificationLink(notification)}
                      onClick={() => setOpen(false)}
                      className={[
                        'flex items-start gap-3 px-4 py-3 text-left transition-colors',
                        'hover:bg-brand-500/5',
                        !notification.read ? 'bg-brand-500/[0.04]' : '',
                      ].join(' ')}
                    >
                      {/* Icon */}
                      <span className="mt-0.5 shrink-0">
                        {getNotificationIcon(notification.type)}
                      </span>

                      {/* Text */}
                      <div className="min-w-0 flex-1">
                        <p
                          className={[
                            'text-sm leading-snug',
                            !notification.read
                              ? 'font-medium text-[rgb(var(--fg))]'
                              : 'text-[rgb(var(--muted))]',
                          ].join(' ')}
                        >
                          {getNotificationDescription(notification)}
                        </p>
                        <p className="mt-0.5 text-xs text-[rgb(var(--muted))]">
                          {relativeTime(notification.createdAt)}
                        </p>
                      </div>

                      {/* Unread dot */}
                      {!notification.read && (
                        <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[rgb(var(--border))] px-4 py-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-brand-500 hover:underline"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
