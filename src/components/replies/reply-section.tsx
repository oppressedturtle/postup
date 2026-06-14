'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

import type { Reply } from '@/types/reply';
import { buildReplyTree, type ReplySort } from '@/lib/build-reply-tree';
import { ReplyCard } from './reply-card';
import { ReplyForm } from './reply-form';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplySectionProps {
  dropId: string;
  /** SSR-fetched flat reply list to avoid a client fetch on first load */
  initialReplies?: Reply[];
  /** Whether the drop is locked by a moderator (disables new replies) */
  isLocked?: boolean;
}

// ---------------------------------------------------------------------------
// Sort tabs config
// ---------------------------------------------------------------------------

const SORT_TABS: { label: string; value: ReplySort }[] = [
  { label: 'Best', value: 'best' },
  { label: 'Top', value: 'top' },
  { label: 'New', value: 'new' },
  { label: 'Controversial', value: 'controversial' },
];

// ---------------------------------------------------------------------------
// ReplySection
// ---------------------------------------------------------------------------

const PAGE_SIZE = 100;

export function ReplySection({ dropId, initialReplies, isLocked = false }: ReplySectionProps) {
  const { data: session } = useSession();

  const [sort, setSort] = useState<ReplySort>('best');
  const [flatReplies, setFlatReplies] = useState<Reply[]>(initialReplies ?? []);
  const [loading, setLoading] = useState(!initialReplies);
  const [error, setError] = useState<string | null>(null);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [hasMore, setHasMore] = useState((initialReplies?.length ?? 0) >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchReplies = useCallback(
    async (sortValue: ReplySort, loadMore = false) => {
      if (!loadMore) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const limit = loadMore ? flatReplies.length + PAGE_SIZE : PAGE_SIZE;
        const res = await fetch(
          `/api/drops/${dropId}/replies?sort=${sortValue}&limit=${limit}`,
        );
        if (!res.ok) throw new Error('Failed to load replies');
        const data = (await res.json()) as { replies: Reply[] };
        setFlatReplies(data.replies);
        setHasMore(data.replies.length >= limit);
      } catch {
        setError('Failed to load replies. Please try again.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [dropId, flatReplies.length],
  );

  // Re-fetch when sort changes (skip initial render if we have SSR data)
  useEffect(() => {
    // On initial mount with pre-fetched data, skip the first fetch
    if (sort === 'best' && initialReplies) return;
    void fetchReplies(sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  function handleSortChange(newSort: ReplySort) {
    if (newSort === sort) return;
    setSort(newSort);
  }

  function handleNewReply(newReply: Reply) {
    // Optimistic prepend: add to flat list so tree rebuilds with it
    setFlatReplies((prev) => [newReply, ...prev]);
    setShowReplyForm(false);
  }

  const tree = buildReplyTree(flatReplies, sort);
  const totalCount = flatReplies.length;

  return (
    <section id="replies" aria-labelledby="replies-heading">
      {/* Heading + sort tabs */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="replies-heading" className="text-base font-semibold text-[rgb(var(--fg))]">
          {totalCount > 0 ? (
            <>
              {totalCount.toLocaleString()}{' '}
              {totalCount === 1 ? 'Reply' : 'Replies'}
            </>
          ) : (
            'Replies'
          )}
        </h2>

        {/* Sort tabs */}
        <div
          role="tablist"
          aria-label="Sort replies"
          className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-1"
        >
          {SORT_TABS.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              type="button"
              aria-selected={sort === tab.value}
              onClick={() => handleSortChange(tab.value)}
              className={[
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                sort === tab.value
                  ? 'bg-brand-500 text-white'
                  : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--border))]',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Locked notice or top-level reply form */}
      {isLocked ? (
        <div className="mb-4 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-3 text-sm text-[rgb(var(--muted))]">
          <span className="mr-1">🔒</span>
          This thread is locked by a moderator.
        </div>
      ) : (
        session?.user && (
          <div className="mb-4">
            {showReplyForm ? (
              <ReplyForm
                dropId={dropId}
                onSuccess={handleNewReply}
                onCancel={() => setShowReplyForm(false)}
                placeholder="What do you think?"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowReplyForm(true)}
                className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-3 text-left text-sm text-[rgb(var(--muted))] hover:border-brand-500/50 hover:text-[rgb(var(--fg))] transition-colors"
              >
                Add a reply…
              </button>
            )}
          </div>
        )
      )}

      {/* Body */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-[rgb(var(--border))]"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button
            type="button"
            onClick={() => void fetchReplies(sort)}
            className="mt-2 text-sm text-brand-500 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : tree.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] py-12 text-center">
          <span aria-hidden="true" className="text-3xl">💬</span>
          <p className="font-medium text-[rgb(var(--fg))]">No replies yet.</p>
          <p className="text-sm text-[rgb(var(--muted))]">Start the conversation!</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 divide-y divide-[rgb(var(--border))]">
          {tree.map((reply) => (
            <ReplyCard
              key={reply.id}
              reply={reply}
              dropId={dropId}
              depth={0}
              isLocked={isLocked}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => void fetchReplies(sort, true)}
            disabled={loadingMore}
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-5 py-2 text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:border-brand-500/50 transition-colors disabled:opacity-50"
          >
            {loadingMore
              ? 'Loading…'
              : `Load more replies (${totalCount.toLocaleString()} shown)`}
          </button>
        </div>
      )}
    </section>
  );
}
