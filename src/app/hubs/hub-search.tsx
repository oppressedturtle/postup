'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HubCard } from '@/components/hubs/hub-card';

interface HubResult {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  nsfw: boolean;
  _count: { memberships: number };
}

interface Props {
  /** Member hub slugs for the current user, used to show join state */
  memberSlugs: Set<string>;
}

export function HubSearch({ memberSlugs }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HubResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = q.trim()
        ? `/api/hubs?q=${encodeURIComponent(q.trim())}&sort=popular`
        : `/api/hubs?sort=popular`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Search failed.');
      const data = (await res.json()) as { hubs: HubResult[] };
      setResults(data.hubs);
    } catch {
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      void search(query);
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, search]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search hubs…"
          aria-label="Search hubs"
          className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] py-2.5 pl-10 pr-4 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
        {loading && (
          <span className="absolute inset-y-0 right-3 flex items-center">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {results !== null && (
        <div>
          {results.length === 0 ? (
            <p className="text-center text-sm text-[rgb(var(--muted))] py-8">
              No hubs found for &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((hub) => (
                <HubCard
                  key={hub.id}
                  hub={{
                    slug: hub.slug,
                    name: hub.name,
                    description: hub.description,
                    icon: hub.icon,
                    nsfw: hub.nsfw,
                    memberCount: hub._count.memberships,
                  }}
                  isMember={memberSlugs.has(hub.slug)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-[rgb(var(--muted))]"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path strokeLinecap="round" d="M14.5 14.5l3 3" />
    </svg>
  );
}
