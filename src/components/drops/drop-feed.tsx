'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import type { Drop } from '@/types/drop';
import { DropCard } from './drop-card';
import { useVoteStates } from '@/hooks/use-vote-states';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortMode = 'hot' | 'rising' | 'fresh' | 'top';

const SORT_LABELS: Record<SortMode, string> = {
  hot: 'Hot',
  rising: 'Rising',
  fresh: 'Fresh',
  top: 'Top',
};

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------

function DropSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4"
    >
      {/* Vote column */}
      <div className="flex w-10 shrink-0 flex-col items-center gap-2 pt-1">
        <div className="h-7 w-7 animate-pulse rounded bg-[rgb(var(--border))]" />
        <div className="h-4 w-6 animate-pulse rounded bg-[rgb(var(--border))]" />
        <div className="h-7 w-7 animate-pulse rounded bg-[rgb(var(--border))]" />
      </div>
      {/* Body */}
      <div className="flex-1 space-y-2">
        <div className="h-3 w-48 animate-pulse rounded bg-[rgb(var(--border))]" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-[rgb(var(--border))]" />
        <div className="h-3 w-full animate-pulse rounded bg-[rgb(var(--border))]" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-[rgb(var(--border))]" />
        <div className="mt-2 flex gap-2">
          <div className="h-6 w-20 animate-pulse rounded bg-[rgb(var(--border))]" />
          <div className="h-6 w-16 animate-pulse rounded bg-[rgb(var(--border))]" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DropFeed
// ---------------------------------------------------------------------------

export interface DropFeedProps {
  hubSlug?: string;
  initialSort?: SortMode;
  /** Override the API URL used for fetching drops (e.g. "/api/stream"). When set, hubSlug is ignored for URL building. */
  feedUrl?: string;
}

export function DropFeed({ hubSlug, initialSort = 'hot', feedUrl }: DropFeedProps) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  const [sort, setSort] = useState<SortMode>(initialSort);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  // Track current sort so the IntersectionObserver callback doesn't close over
  // a stale sort value
  const sortRef = useRef<SortMode>(sort);
  sortRef.current = sort;

  // Bulk vote hydration — fetches all visible drop vote states in one request
  const voteStates = useVoteStates(drops.map((d) => d.id));

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  function buildUrl(cursor?: string, currentSort?: SortMode): string {
    if (feedUrl) {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      const qs = params.toString();
      return qs ? `${feedUrl}?${qs}` : feedUrl;
    }
    const params = new URLSearchParams({ sort: currentSort ?? sortRef.current });
    if (hubSlug) params.set('hubSlug', hubSlug);
    if (cursor) params.set('cursor', cursor);
    return `/api/drops?${params.toString()}`;
  }

  const fetchInitial = useCallback(
    async (nextSort: SortMode) => {
      setLoading(true);
      setError(null);
      setDrops([]);
      setNextCursor(null);

      try {
        const res = await fetch(buildUrl(undefined, nextSort));
        if (!res.ok) throw new Error('Failed to load drops');
        const data = (await res.json()) as { drops: Drop[]; nextCursor: string | null };
        setDrops(data.drops);
        setNextCursor(data.nextCursor);
      } catch {
        setError('Could not load drops. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hubSlug, feedUrl],
  );

  const fetchMore = useCallback(async () => {
    if (loadingMore || !nextCursor) return;
    setLoadingMore(true);

    try {
      const res = await fetch(buildUrl(nextCursor));
      if (!res.ok) throw new Error('Failed to load more drops');
      const data = (await res.json()) as { drops: Drop[]; nextCursor: string | null };
      setDrops((prev) => [...prev, ...data.drops]);
      setNextCursor(data.nextCursor);
    } catch {
      // Silent — user can scroll back to trigger again
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, loadingMore]);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Initial + sort-change fetch
  useEffect(() => {
    void fetchInitial(sort);
  }, [sort, fetchInitial]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore && nextCursor) {
          void fetchMore();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchMore, loadingMore, nextCursor]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleDropDeleted(id: string) {
    setDrops((prev) => prev.filter((d) => d.id !== id));
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-3">
      {/* Sort tabs — hidden when using a custom feedUrl (the API owns sorting) */}
      {!feedUrl && (
        <div
          role="tablist"
          aria-label="Sort drops by"
          className="flex gap-1 border-b border-[rgb(var(--border))] pb-0"
        >
          {(Object.keys(SORT_LABELS) as SortMode[]).map((s) => (
            <button
              key={s}
              role="tab"
              type="button"
              aria-selected={sort === s}
              onClick={() => setSort(s)}
              className={
                sort === s
                  ? 'border-b-2 border-brand-500 px-4 py-2 text-sm font-medium text-brand-500'
                  : 'border-b-2 border-transparent px-4 py-2 text-sm font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] transition-colors'
              }
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {/* Loading state — initial */}
      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading drops">
          <DropSkeleton />
          <DropSkeleton />
          <DropSkeleton />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && drops.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] py-16 text-center">
          <span aria-hidden="true" className="text-4xl">
            📭
          </span>
          <p className="font-medium text-[rgb(var(--fg))]">No drops yet.</p>
          <p className="text-sm text-[rgb(var(--muted))]">Be the first to post!</p>
          {hubSlug && (
            <Link
              href={`/h/${hubSlug}/submit`}
              className="mt-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
            >
              Create a Drop
            </Link>
          )}
        </div>
      )}

      {/* Drop list */}
      {!loading && drops.length > 0 && (
        <ul className="space-y-3" aria-label="Drops">
          {drops.map((drop) => (
            <li key={drop.id}>
              <DropCard
                drop={drop}
                isAuthor={currentUserId === drop.authorId}
                onDeleted={handleDropDeleted}
                voteState={voteStates[drop.id]}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Load-more sentinel */}
      <div ref={sentinelRef} aria-hidden="true" />

      {/* Load-more spinner */}
      {loadingMore && (
        <div className="flex justify-center py-4" aria-busy="true" aria-label="Loading more drops">
          <svg
            className="h-6 w-6 animate-spin text-brand-500"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {/* End of feed */}
      {!loading && !loadingMore && nextCursor === null && drops.length > 0 && (
        <p className="py-4 text-center text-sm text-[rgb(var(--muted))]">
          You&apos;ve reached the end.
        </p>
      )}
    </div>
  );
}
