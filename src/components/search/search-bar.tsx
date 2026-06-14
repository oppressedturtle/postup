'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchDrop {
  id: string;
  title: string;
  heat: number;
  replyCount: number;
  hub: { slug: string; name: string; icon: string | null };
}

interface SearchHub {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  memberCount: number;
}

interface SearchUser {
  id: string;
  handle: string;
  displayName: string;
  avatar: string | null;
  clout: number;
}

interface SearchResults {
  drops: SearchDrop[];
  hubs: SearchHub[];
  users: SearchUser[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function HubIcon({ src, initial, size }: { src: string | null; initial: string; size: number }) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-500 font-bold text-white"
    >
      {initial}
    </span>
  );
}

function Avatar({ src, initials, size }: { src: string | null; initials: string; size: number }) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-500 font-semibold text-white"
    >
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SearchSkeleton() {
  return (
    <div className="space-y-1 p-2" aria-busy="true" aria-label="Loading search results">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-lg bg-[rgb(var(--border))]"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result items
// ---------------------------------------------------------------------------

interface ResultItemProps {
  href: string;
  focused: boolean;
  onClick: () => void;
  children: React.ReactNode;
  id: string;
}

function ResultItem({ href, focused, onClick, children, id }: ResultItemProps) {
  return (
    <li id={id} role="option" aria-selected={focused}>
      <Link
        href={href}
        onClick={onClick}
        className={[
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
          focused
            ? 'bg-brand-500/10 text-brand-500'
            : 'text-[rgb(var(--fg))] hover:bg-[rgb(var(--border))]',
        ].join(' ')}
      >
        {children}
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// SearchBar
// ---------------------------------------------------------------------------

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [expanded, setExpanded] = useState(false); // mobile expand state

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------------------
  // Build flat list of result links for keyboard nav
  // ---------------------------------------------------------------------------

  const flatResults: Array<{ href: string; label: string }> = [];
  if (results) {
    results.drops.slice(0, 3).forEach((d) =>
      flatResults.push({ href: `/drops/${d.id}`, label: d.title }),
    );
    results.hubs.slice(0, 3).forEach((h) =>
      flatResults.push({ href: `/h/${h.slug}`, label: h.name }),
    );
    results.users.slice(0, 3).forEach((u) =>
      flatResults.push({ href: `/u/${u.handle}`, label: u.displayName }),
    );
  }
  // "See all" entry
  if (query.length >= 2) {
    flatResults.push({ href: `/search?q=${encodeURIComponent(query)}`, label: 'See all results' });
  }

  // ---------------------------------------------------------------------------
  // Fetch search results (debounced)
  // ---------------------------------------------------------------------------

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }

    setLoading(true);
    setOpen(true);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&limit=3`,
        { signal: ctrl.signal },
      );
      if (!res.ok) {
        setResults({ drops: [], hubs: [], users: [] });
        return;
      }
      const data = (await res.json()) as SearchResults;
      setResults(data);
      setFocusedIndex(-1);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setResults({ drops: [], hubs: [], users: [] });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchResults(val), 300);
  }

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (focusedIndex >= 0 && flatResults[focusedIndex]) {
        e.preventDefault();
        router.push(flatResults[focusedIndex].href);
        close();
      } else if (query.length >= 2) {
        e.preventDefault();
        router.push(`/search?q=${encodeURIComponent(query)}`);
        close();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function close() {
    setOpen(false);
    setFocusedIndex(-1);
    if (expanded) setExpanded(false);
  }

  // ---------------------------------------------------------------------------
  // Close on outside click
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        close();
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hasResults = results && (
    results.drops.length > 0 ||
    results.hubs.length > 0 ||
    results.users.length > 0
  );

  // Global result index counter for keyboard nav
  let globalIdx = 0;

  function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
      <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
        {children}
      </p>
    );
  }

  return (
    <div className="relative flex-1 max-w-md">
      {/* Mobile: icon-only toggle */}
      <button
        type="button"
        aria-label="Open search"
        onClick={() => {
          setExpanded(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className={[
          'sm:hidden flex items-center justify-center rounded-lg p-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:bg-brand-500/10 transition-colors',
          expanded ? 'hidden' : 'flex',
        ].join(' ')}
      >
        <SearchIcon />
      </button>

      {/* Input wrapper */}
      <div
        className={[
          'relative',
          // On mobile: hidden until expanded; on desktop: always shown
          expanded ? 'block' : 'hidden sm:block',
        ].join(' ')}
      >
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[rgb(var(--muted))]">
          <SearchIcon />
        </span>

        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.length >= 2) setOpen(true);
          }}
          placeholder="Search drops, hubs, people…"
          aria-label="Search PostUp"
          aria-autocomplete="list"
          aria-controls={open ? 'search-results-panel' : undefined}
          aria-activedescendant={
            focusedIndex >= 0 ? `search-result-${focusedIndex}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          className={[
            'w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))]',
            'py-1.5 pl-9 pr-3 text-sm text-[rgb(var(--fg))]',
            'placeholder:text-[rgb(var(--muted))]',
            'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
            'transition-colors',
          ].join(' ')}
        />

        {/* Mobile close button */}
        {expanded && (
          <button
            type="button"
            aria-label="Close search"
            onClick={() => {
              setExpanded(false);
              setQuery('');
              setOpen(false);
            }}
            className="absolute inset-y-0 right-2 flex items-center px-1 text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] sm:hidden"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Results panel */}
      {open && (
        <div
          id="search-results-panel"
          ref={panelRef}
          role="listbox"
          aria-label={`Search results for ${query}`}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[480px] overflow-y-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] shadow-lg"
        >
          {loading ? (
            <SearchSkeleton />
          ) : !hasResults ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[rgb(var(--muted))]">
                No results for &ldquo;{query}&rdquo;
              </p>
            </div>
          ) : (
            <ul className="py-1">
              {/* Drops section */}
              {results!.drops.length > 0 && (
                <>
                  <SectionHeading>Drops</SectionHeading>
                  {results!.drops.slice(0, 3).map((drop) => {
                    const idx = globalIdx++;
                    return (
                      <ResultItem
                        key={drop.id}
                        href={`/drops/${drop.id}`}
                        focused={focusedIndex === idx}
                        onClick={close}
                        id={`search-result-${idx}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 text-[rgb(var(--muted))]">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{drop.title}</p>
                          <p className="truncate text-xs text-[rgb(var(--muted))]">
                            h/{drop.hub.slug} · {drop.heat} heat · {drop.replyCount}{' '}
                            {drop.replyCount === 1 ? 'reply' : 'replies'}
                          </p>
                        </div>
                      </ResultItem>
                    );
                  })}
                </>
              )}

              {/* Hubs section */}
              {results!.hubs.length > 0 && (
                <>
                  <SectionHeading>Hubs</SectionHeading>
                  {results!.hubs.slice(0, 3).map((hub) => {
                    const idx = globalIdx++;
                    const initial = (hub.name[0] ?? 'H').toUpperCase();
                    return (
                      <ResultItem
                        key={hub.id}
                        href={`/h/${hub.slug}`}
                        focused={focusedIndex === idx}
                        onClick={close}
                        id={`search-result-${idx}`}
                      >
                        <HubIcon src={hub.icon} initial={initial} size={20} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">h/{hub.slug}</p>
                          <p className="truncate text-xs text-[rgb(var(--muted))]">
                            {hub.memberCount.toLocaleString()} member{hub.memberCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </ResultItem>
                    );
                  })}
                </>
              )}

              {/* Users section */}
              {results!.users.length > 0 && (
                <>
                  <SectionHeading>Users</SectionHeading>
                  {results!.users.slice(0, 3).map((user) => {
                    const idx = globalIdx++;
                    const initials = (user.displayName.slice(0, 2) || user.handle.slice(0, 2)).toUpperCase();
                    return (
                      <ResultItem
                        key={user.id}
                        href={`/u/${user.handle}`}
                        focused={focusedIndex === idx}
                        onClick={close}
                        id={`search-result-${idx}`}
                      >
                        <Avatar src={user.avatar} initials={initials} size={20} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">u/{user.handle}</p>
                          <p className="truncate text-xs text-[rgb(var(--muted))]">
                            {user.clout.toLocaleString()} clout
                          </p>
                        </div>
                      </ResultItem>
                    );
                  })}
                </>
              )}

              {/* See all */}
              {(() => {
                const idx = globalIdx++;
                return (
                  <li className="border-t border-[rgb(var(--border))] mt-1 pt-1" role="option" aria-selected={focusedIndex === idx} id={`search-result-${idx}`}>
                    <Link
                      href={`/search?q=${encodeURIComponent(query)}`}
                      onClick={close}
                      className={[
                        'flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
                        focusedIndex === idx
                          ? 'bg-brand-500/10 text-brand-500'
                          : 'text-brand-500 hover:bg-brand-500/5',
                      ].join(' ')}
                    >
                      See all results for &ldquo;{query}&rdquo;
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </li>
                );
              })()}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}
