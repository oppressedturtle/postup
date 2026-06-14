'use client';

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoteStateMap = Record<
  string,
  { userVote: 1 | -1 | null; heat: number } | undefined
>;

// ---------------------------------------------------------------------------
// useVoteStates
// ---------------------------------------------------------------------------

/**
 * Given a list of drop IDs, fetches /api/votes?dropIds=... once and returns
 * a map of { [dropId]: { userVote, heat } }.
 *
 * - Debounced 100 ms so that rapid dropIds changes (infinite scroll) coalesce.
 * - Returns an empty map while loading or unauthenticated.
 * - On 401 (unauthenticated) the hook silently stays empty — vote hydration
 *   is optional for logged-out users.
 */
export function useVoteStates(dropIds: string[]): VoteStateMap {
  const [voteStates, setVoteStates] = useState<VoteStateMap>({});

  // Use a stable serialised key so the effect only re-runs when IDs actually
  // change, not just when the array reference changes.
  const dropIdsKey = dropIds.join(',');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dropIdsKey) return;

    // Clear any pending debounced fetch
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/votes?dropIds=${encodeURIComponent(dropIdsKey)}`);

          // 401 = logged out — nothing to hydrate; stay empty
          if (res.status === 401) return;
          if (!res.ok) return;

          const data = (await res.json()) as VoteStateMap;
          setVoteStates((prev) => ({ ...prev, ...data }));
        } catch {
          // Silent — optimistic initial values remain
        }
      })();
    }, 100);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [dropIdsKey]);

  return voteStates;
}
