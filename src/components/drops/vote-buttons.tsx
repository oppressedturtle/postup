'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoteButtonsProps {
  dropId: string;
  initialHeat: number;
  initialUserVote: 1 | -1 | null;
  orientation?: 'vertical' | 'horizontal';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format large numbers: 1234 → "1.2k", 1000000 → "1M" */
function formatHeat(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// VoteButtons
// ---------------------------------------------------------------------------

export function VoteButtons({
  dropId,
  initialHeat,
  initialUserVote,
  orientation = 'vertical',
}: VoteButtonsProps) {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [heat, setHeat] = useState(initialHeat);
  const [userVote, setUserVote] = useState<1 | -1 | null>(initialUserVote);
  const [loading, setLoading] = useState(false);
  const [clickedButton, setClickedButton] = useState<1 | -1 | null>(null);

  // Track whether we've hydrated from the server-passed initial value so we
  // don't double-fetch when the prop is explicitly provided.
  const hydratedRef = useRef(initialUserVote !== undefined);

  // On mount: if initialUserVote was not pre-hydrated (undefined), fetch
  // current vote state from the API. When initialUserVote is null or 1/-1
  // it's considered pre-hydrated and we skip the fetch.
  useEffect(() => {
    if (hydratedRef.current) return;
    if (status !== 'authenticated') return;

    hydratedRef.current = true;

    void (async () => {
      try {
        const res = await fetch(`/api/drops/${dropId}/vote`);
        if (!res.ok) return;
        const data = (await res.json()) as { userVote: 1 | -1 | null; heat: number };
        setUserVote(data.userVote);
        setHeat(data.heat);
      } catch {
        // Silent — initial optimistic values remain
      }
    })();
  }, [dropId, status]);

  const handleVote = useCallback(
    async (value: 1 | -1) => {
      if (status !== 'authenticated') {
        router.push('/login');
        return;
      }

      if (loading) return;

      // Optimistic update
      const prevHeat = heat;
      const prevVote = userVote;

      let heatDelta = 0;
      let nextVote: 1 | -1 | null;

      if (userVote === value) {
        // Toggle off
        heatDelta = -value;
        nextVote = null;
      } else if (userVote !== null) {
        // Flip vote
        heatDelta = value - userVote;
        nextVote = value;
      } else {
        // New vote
        heatDelta = value;
        nextVote = value;
      }

      setHeat((h) => h + heatDelta);
      setUserVote(nextVote);
      setLoading(true);
      setClickedButton(value);

      try {
        const res = await fetch(`/api/drops/${dropId}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        });

        if (!res.ok) {
          // Revert on error
          setHeat(prevHeat);
          setUserVote(prevVote);
          return;
        }

        const data = (await res.json()) as { heat: number; userVote: 1 | -1 | null };
        setHeat(data.heat);
        setUserVote(data.userVote);
      } catch {
        // Revert on network error
        setHeat(prevHeat);
        setUserVote(prevVote);
      } finally {
        setLoading(false);
        setClickedButton(null);
      }
    },
    [dropId, heat, userVote, loading, status, router],
  );

  const isVertical = orientation === 'vertical';

  const boostActive = userVote === 1;
  const buryActive = userVote === -1;

  const boostClass = [
    'flex items-center justify-center rounded transition-colors',
    isVertical ? 'h-7 w-7' : 'h-6 w-6',
    boostActive
      ? 'text-brand-500 font-bold'
      : 'text-[rgb(var(--muted))] hover:text-brand-500 hover:bg-[rgb(var(--border))]',
    loading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
  ].join(' ');

  const buryClass = [
    'flex items-center justify-center rounded transition-colors',
    isVertical ? 'h-7 w-7' : 'h-6 w-6',
    buryActive
      ? 'text-indigo-500 font-bold'
      : 'text-[rgb(var(--muted))] hover:text-indigo-400 hover:bg-[rgb(var(--border))]',
    loading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
  ].join(' ');

  const heatClass = [
    'font-semibold tabular-nums',
    isVertical ? 'text-xs' : 'text-xs',
    boostActive
      ? 'text-brand-500'
      : buryActive
        ? 'text-indigo-500'
        : 'text-[rgb(var(--muted))]',
  ].join(' ');

  const containerClass = isVertical
    ? 'flex w-10 shrink-0 flex-col items-center gap-1 pt-1'
    : 'flex flex-row items-center gap-1';

  const iconSize = isVertical ? 14 : 12;

  return (
    <div className={containerClass}>
      {/* Boost button */}
      <button
        type="button"
        onClick={() => void handleVote(1)}
        disabled={loading}
        aria-label={boostActive ? 'Remove Boost' : 'Boost this drop'}
        aria-pressed={boostActive}
        className={boostClass}
      >
        {loading && clickedButton === 1 ? (
          <Spinner />
        ) : (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            style={boostActive ? { filter: 'drop-shadow(0 0 2px currentColor)' } : undefined}
          >
            <path d="M12 4l8 14H4z" />
          </svg>
        )}
      </button>

      {/* Heat score */}
      <span className={heatClass} aria-label={`${heat} heat`}>
        {formatHeat(heat)}
      </span>

      {/* Bury button */}
      <button
        type="button"
        onClick={() => void handleVote(-1)}
        disabled={loading}
        aria-label={buryActive ? 'Remove Bury' : 'Bury this drop'}
        aria-pressed={buryActive}
        className={buryClass}
      >
        {loading && clickedButton === -1 ? (
          <Spinner />
        ) : (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            style={buryActive ? { filter: 'drop-shadow(0 0 2px currentColor)' } : undefined}
          >
            <path d="M12 20L4 6h16z" />
          </svg>
        )}
      </button>
    </div>
  );
}
