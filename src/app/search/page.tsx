import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Prisma } from '@/generated/prisma/client';

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { DropCard } from '@/components/drops/drop-card';
import { HubCard } from '@/components/hubs/hub-card';
import { Avatar } from '@/components/user-nav';
import type { Drop } from '@/types/drop';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabType = 'all' | 'drops' | 'hubs' | 'users';

interface Props {
  searchParams: Promise<{ q?: string; type?: string }>;
}

interface SearchDrop {
  id: string;
  title: string;
  body: string | null;
  type: string;
  heat: number;
  createdAt: Date;
  replyCount: bigint;
  authorHandle: string;
  authorDisplayName: string;
  authorAvatar: string | null;
  authorId: string;
  hubId: string;
  hubSlug: string;
  hubName: string;
  hubIcon: string | null;
}

interface SearchHub {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  memberCount: bigint;
}

interface SearchUser {
  id: string;
  handle: string;
  displayName: string;
  avatar: string | null;
  clout: number;
  bio: string | null;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  if (!query) {
    return { title: 'Search — PostUp' };
  }
  return {
    title: `Search results for "${query}"`,
    description: `Search PostUp for drops, hubs, and users matching "${query}".`,
  };
}

// ---------------------------------------------------------------------------
// Data fetching (direct Prisma for SSR)
// ---------------------------------------------------------------------------

async function searchDrops(q: string, limit: number): Promise<SearchDrop[]> {
  return db.$queryRaw<SearchDrop[]>`
    SELECT
      d.id,
      d.title,
      d.body,
      d.type,
      d.heat,
      d."createdAt",
      u.handle        AS "authorHandle",
      u."displayName" AS "authorDisplayName",
      u.avatar        AS "authorAvatar",
      u.id            AS "authorId",
      d."hubId",
      h.slug          AS "hubSlug",
      h.name          AS "hubName",
      h.icon          AS "hubIcon",
      COUNT(r.id)     AS "replyCount"
    FROM "Drop" d
    JOIN "User" u ON u.id = d."authorId"
    JOIN "Hub"  h ON h.id = d."hubId"
    LEFT JOIN "Reply" r ON r."dropId" = d.id AND r."isRemoved" = false
    WHERE
      d."isRemoved" = false
      AND to_tsvector('english', d.title || ' ' || COALESCE(d.body, ''))
          @@ plainto_tsquery('english', ${q})
    GROUP BY d.id, u.handle, u."displayName", u.avatar, u.id, h.slug, h.name, h.icon
    ORDER BY
      ts_rank(
        to_tsvector('english', d.title || ' ' || COALESCE(d.body, '')),
        plainto_tsquery('english', ${q})
      ) DESC,
      d.heat DESC
    LIMIT ${Prisma.raw(String(limit))}
  `;
}

async function searchHubs(q: string, limit: number): Promise<SearchHub[]> {
  return db.$queryRaw<SearchHub[]>`
    SELECT
      h.id,
      h.slug,
      h.name,
      h.description,
      h.icon,
      COUNT(DISTINCT m.id) AS "memberCount"
    FROM "Hub" h
    LEFT JOIN "Membership" m ON m."hubId" = h.id
    WHERE
      to_tsvector('english', h.name || ' ' || h.description)
      @@ plainto_tsquery('english', ${q})
    GROUP BY h.id
    ORDER BY
      ts_rank(
        to_tsvector('english', h.name || ' ' || h.description),
        plainto_tsquery('english', ${q})
      ) DESC,
      COUNT(DISTINCT m.id) DESC
    LIMIT ${Prisma.raw(String(limit))}
  `;
}

async function searchUsers(q: string, limit: number): Promise<SearchUser[]> {
  return db.$queryRaw<SearchUser[]>`
    SELECT
      u.id,
      u.handle,
      u."displayName",
      u.avatar,
      u.clout,
      u.bio
    FROM "User" u
    WHERE
      to_tsvector('simple', u.handle || ' ' || u."displayName")
      @@ plainto_tsquery('simple', ${q})
    ORDER BY
      ts_rank(
        to_tsvector('simple', u.handle || ' ' || u."displayName"),
        plainto_tsquery('simple', ${q})
      ) DESC,
      u.clout DESC
    LIMIT ${Prisma.raw(String(limit))}
  `;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TABS: { value: TabType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'drops', label: 'Drops' },
  { value: 'hubs', label: 'Hubs' },
  { value: 'users', label: 'Users' },
];

export default async function SearchPage({ searchParams }: Props) {
  const { q, type: rawType } = await searchParams;
  const query = q?.trim() ?? '';
  const tab: TabType = (['drops', 'hubs', 'users'].includes(rawType ?? '') ? rawType : 'all') as TabType;

  const [session, drops, hubs, users] = query.length >= 2
    ? await Promise.all([
        auth(),
        (tab === 'all' || tab === 'drops') ? searchDrops(query, 25) : Promise.resolve([]),
        (tab === 'all' || tab === 'hubs') ? searchHubs(query, 25) : Promise.resolve([]),
        (tab === 'all' || tab === 'users') ? searchUsers(query, 25) : Promise.resolve([]),
      ])
    : [await auth(), [], [], []];

  // Get membership slugs to power join button state
  let memberSlugs = new Set<string>();
  if (session?.user?.id && hubs.length > 0) {
    const memberships = await db.membership.findMany({
      where: { userId: session.user.id },
      select: { hub: { select: { slug: true } } },
    });
    memberSlugs = new Set(memberships.map((m) => m.hub.slug));
  }

  // Serialize drops for client components
  const serializedDrops: Drop[] = drops.map((d) => ({
    id: d.id,
    title: d.title,
    type: d.type as Drop['type'],
    body: d.body,
    imageUrl: null,
    videoUrl: null,
    linkUrl: null,
    linkPreview: null,
    heat: d.heat,
    isPinned: false,
    isLocked: false,
    isRemoved: false,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.createdAt.toISOString(),
    hubId: d.hubId,
    authorId: d.authorId,
    author: {
      id: d.authorId,
      handle: d.authorHandle,
      displayName: d.authorDisplayName,
      avatar: d.authorAvatar,
    },
    hub: {
      id: d.hubId,
      slug: d.hubSlug,
      name: d.hubName,
      icon: d.hubIcon,
    },
    _count: { replies: Number(d.replyCount), votes: 0 },
  }));

  const totalResults = drops.length + hubs.length + users.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">
          {query ? (
            <>
              Search results for{' '}
              <span className="text-brand-500">&ldquo;{query}&rdquo;</span>
            </>
          ) : (
            'Search'
          )}
        </h1>
        {query && query.length >= 2 && (
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">
            {totalResults} result{totalResults !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* No query state */}
      {!query || query.length < 2 ? (
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
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <p className="font-medium text-[rgb(var(--fg))]">Enter at least 2 characters to search.</p>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div
            role="tablist"
            aria-label="Filter search results"
            className="flex gap-1 border-b border-[rgb(var(--border))]"
          >
            {TABS.map(({ value, label }) => (
              <Link
                key={value}
                href={`/search?q=${encodeURIComponent(query)}${value !== 'all' ? `&type=${value}` : ''}`}
                role="tab"
                aria-selected={tab === value}
                className={[
                  'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                  tab === value
                    ? 'border-brand-500 text-brand-500'
                    : 'border-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]',
                ].join(' ')}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Results */}
          {totalResults === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <p className="font-medium text-[rgb(var(--fg))]">
                No results for &ldquo;{query}&rdquo;
              </p>
              <p className="text-sm text-[rgb(var(--muted))]">
                Try different keywords or check your spelling.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Drops */}
              {(tab === 'all' || tab === 'drops') && serializedDrops.length > 0 && (
                <section aria-labelledby="drops-heading">
                  {tab === 'all' && (
                    <h2 id="drops-heading" className="mb-3 text-sm font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                      Drops
                    </h2>
                  )}
                  <div className="space-y-3">
                    {serializedDrops.map((drop) => (
                      <DropCard key={drop.id} drop={drop} />
                    ))}
                  </div>
                </section>
              )}

              {/* Hubs */}
              {(tab === 'all' || tab === 'hubs') && hubs.length > 0 && (
                <section aria-labelledby="hubs-heading">
                  {tab === 'all' && (
                    <h2 id="hubs-heading" className="mb-3 text-sm font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                      Hubs
                    </h2>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {hubs.map((hub) => (
                      <HubCard
                        key={hub.id}
                        hub={{
                          slug: hub.slug,
                          name: hub.name,
                          description: hub.description,
                          icon: hub.icon,
                          nsfw: false,
                          memberCount: Number(hub.memberCount),
                        }}
                        isMember={memberSlugs.has(hub.slug)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Users */}
              {(tab === 'all' || tab === 'users') && users.length > 0 && (
                <section aria-labelledby="users-heading">
                  {tab === 'all' && (
                    <h2 id="users-heading" className="mb-3 text-sm font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                      Users
                    </h2>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {users.map((user) => {
                      const initials = (user.displayName.slice(0, 2) || user.handle.slice(0, 2)).toUpperCase();
                      return (
                        <Link
                          key={user.id}
                          href={`/u/${user.handle}`}
                          className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4 hover:border-brand-500/50 transition-colors"
                        >
                          <Avatar src={user.avatar} initials={initials} size={40} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[rgb(var(--fg))] truncate">
                              {user.displayName}
                            </p>
                            <p className="text-xs text-[rgb(var(--muted))]">
                              @{user.handle} · {user.clout.toLocaleString()} clout
                            </p>
                            {user.bio && (
                              <p className="mt-1 text-xs text-[rgb(var(--fg))] line-clamp-2">
                                {user.bio}
                              </p>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Empty state for specific tab */}
              {tab !== 'all' && (
                <>
                  {tab === 'drops' && serializedDrops.length === 0 && (
                    <EmptyState message={`No drops found for "${query}"`} />
                  )}
                  {tab === 'hubs' && hubs.length === 0 && (
                    <EmptyState message={`No hubs found for "${query}"`} />
                  )}
                  {tab === 'users' && users.length === 0 && (
                    <EmptyState message={`No users found for "${query}"`} />
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="font-medium text-[rgb(var(--fg))]">{message}</p>
      <p className="text-sm text-[rgb(var(--muted))]">
        Try different keywords or browse all hubs.
      </p>
    </div>
  );
}
