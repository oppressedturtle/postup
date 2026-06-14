'use client';

import { useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DropSummary {
  id: string;
  title: string;
  type: string;
  heat: number;
  createdAt: string;
  hub: { slug: string; name: string };
  _count: { replies: number };
}

interface ReplySummary {
  id: string;
  body: string;
  heat: number;
  createdAt: string;
  drop: {
    id: string;
    title: string;
    hub: { slug: string; name: string };
  };
}

interface ProfileTabsProps {
  handle: string;
  displayName: string;
  drops: DropSummary[];
  replies: ReplySummary[];
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

function formatHeat(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DropsTab({ drops, displayName }: { drops: DropSummary[]; displayName: string }) {
  if (drops.length === 0) {
    return (
      <div
        role="tabpanel"
        className="mt-6 flex flex-col items-center gap-2 py-12 text-center"
      >
        <span aria-hidden="true" className="text-4xl">📭</span>
        <p className="font-medium text-[rgb(var(--fg))]">No Drops yet</p>
        <p className="text-sm text-[rgb(var(--muted))]">
          {displayName} hasn&apos;t posted any Drops yet.
        </p>
      </div>
    );
  }

  return (
    <div role="tabpanel" className="mt-4 space-y-2">
      {drops.map((drop) => (
        <article
          key={drop.id}
          className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4"
        >
          {/* Heat */}
          <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 pt-0.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-brand-500">
              <path d="M12 4l8 14H4z" />
            </svg>
            <span className="text-xs font-semibold tabular-nums text-[rgb(var(--muted))]">
              {formatHeat(drop.heat)}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1 text-xs text-[rgb(var(--muted))]">
              <Link
                href={`/h/${drop.hub.slug}`}
                className="font-medium text-[rgb(var(--fg))] hover:text-brand-500 transition-colors"
              >
                h/{drop.hub.slug}
              </Link>
              <span aria-hidden="true">·</span>
              <time dateTime={drop.createdAt}>{relativeTime(drop.createdAt)}</time>
            </div>
            <h2 className="mt-0.5">
              <Link
                href={`/drops/${drop.id}`}
                className="text-sm font-semibold text-[rgb(var(--fg))] hover:text-brand-500 transition-colors"
              >
                {drop.title}
              </Link>
            </h2>
            <div className="mt-1 flex items-center gap-1 text-xs text-[rgb(var(--muted))]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>
                {drop._count.replies} {drop._count.replies === 1 ? 'reply' : 'replies'}
              </span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function RepliesTab({ replies, displayName }: { replies: ReplySummary[]; displayName: string }) {
  if (replies.length === 0) {
    return (
      <div
        role="tabpanel"
        className="mt-6 flex flex-col items-center gap-2 py-12 text-center"
      >
        <span aria-hidden="true" className="text-4xl">💬</span>
        <p className="font-medium text-[rgb(var(--fg))]">No Replies yet</p>
        <p className="text-sm text-[rgb(var(--muted))]">
          {displayName} hasn&apos;t replied to anything yet.
        </p>
      </div>
    );
  }

  return (
    <div role="tabpanel" className="mt-4 space-y-2">
      {replies.map((reply) => (
        <article
          key={reply.id}
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4"
        >
          {/* Parent context */}
          <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-[rgb(var(--muted))]">
            <span>Replied in</span>
            <Link
              href={`/h/${reply.drop.hub.slug}`}
              className="font-medium text-[rgb(var(--fg))] hover:text-brand-500 transition-colors"
            >
              h/{reply.drop.hub.slug}
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href={`/drops/${reply.drop.id}#replies`}
              className="hover:text-brand-500 transition-colors truncate max-w-xs"
            >
              {reply.drop.title}
            </Link>
          </div>

          {/* Reply body preview */}
          <Link
            href={`/drops/${reply.drop.id}#reply-${reply.id}`}
            className="block"
          >
            <p className="text-sm text-[rgb(var(--fg))] line-clamp-3 leading-relaxed">
              {reply.body.length > 280
                ? reply.body.slice(0, 280) + '…'
                : reply.body}
            </p>
          </Link>

          {/* Footer */}
          <div className="mt-2 flex items-center gap-2 text-xs text-[rgb(var(--muted))]">
            <div className="flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-brand-500">
                <path d="M12 4l8 14H4z" />
              </svg>
              <span className="tabular-nums">{formatHeat(reply.heat)}</span>
            </div>
            <span aria-hidden="true">·</span>
            <time dateTime={reply.createdAt}>{relativeTime(reply.createdAt)}</time>
          </div>
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfileTabs
// ---------------------------------------------------------------------------

type Tab = 'drops' | 'replies';

export function ProfileTabs({ handle: _handle, displayName, drops, replies }: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('drops');

  return (
    <div>
      <div
        role="tablist"
        aria-label="Profile sections"
        className="flex gap-1 border-b border-[rgb(var(--border))]"
      >
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'drops'}
          aria-controls="drops-panel"
          id="drops-tab"
          onClick={() => setActiveTab('drops')}
          className={[
            'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'drops'
              ? 'border-brand-500 text-brand-500'
              : 'border-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]',
          ].join(' ')}
        >
          Drops
          {drops.length > 0 && (
            <span className="ml-1.5 rounded-full bg-[rgb(var(--border))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--muted))]">
              {drops.length}
            </span>
          )}
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'replies'}
          aria-controls="replies-panel"
          id="replies-tab"
          onClick={() => setActiveTab('replies')}
          className={[
            'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'replies'
              ? 'border-brand-500 text-brand-500'
              : 'border-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]',
          ].join(' ')}
        >
          Replies
          {replies.length > 0 && (
            <span className="ml-1.5 rounded-full bg-[rgb(var(--border))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--muted))]">
              {replies.length}
            </span>
          )}
        </button>
      </div>

      <div id="drops-panel" role="tabpanel" aria-labelledby="drops-tab" hidden={activeTab !== 'drops'}>
        {activeTab === 'drops' && (
          <DropsTab drops={drops} displayName={displayName} />
        )}
      </div>
      <div id="replies-panel" role="tabpanel" aria-labelledby="replies-tab" hidden={activeTab !== 'replies'}>
        {activeTab === 'replies' && (
          <RepliesTab replies={replies} displayName={displayName} />
        )}
      </div>
    </div>
  );
}
