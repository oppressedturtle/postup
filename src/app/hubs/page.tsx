import Link from 'next/link';
import type { Metadata } from 'next';

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { HubCard, HubIcon } from '@/components/hubs/hub-card';
import { HubSearch } from './hub-search';

export const metadata: Metadata = {
  title: 'Discover Hubs',
  description: 'Browse and join communities on PostUp.',
};

type SortParam = 'popular' | 'new';

interface Props {
  searchParams: Promise<{ sort?: string }>;
}

interface TrendingHub {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  memberCount: number;
  newDropCount: number;
}

interface RecommendedHub {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  description: string;
  memberCount: number;
}

export default async function HubsPage({ searchParams }: Props) {
  const { sort: rawSort } = await searchParams;
  const sort: SortParam = rawSort === 'new' ? 'new' : 'popular';

  const [session, hubs] = await Promise.all([
    auth(),
    db.hub.findMany({
      include: { _count: { select: { memberships: true } } },
      orderBy:
        sort === 'popular'
          ? { memberships: { _count: 'desc' } }
          : { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const userId = session?.user?.id ?? null;

  // Get the current user's memberships for join button state
  let memberSlugs = new Set<string>();
  if (userId) {
    const memberships = await db.membership.findMany({
      where: { userId },
      include: { hub: { select: { slug: true } } },
    });
    memberSlugs = new Set(memberships.map((m) => m.hub.slug));
  }

  // Fetch trending and recommended from internal APIs (server-side)
  let trendingHubs: TrendingHub[] = [];
  let recommendedHubs: RecommendedHub[] = [];

  try {
    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
    const [trendingRes, recommendedRes] = await Promise.all([
      fetch(`${baseUrl}/api/hubs/trending`, { next: { revalidate: 600 } }),
      fetch(`${baseUrl}/api/hubs/recommended`, {
        next: { revalidate: 300 },
        headers: userId ? { cookie: '' } : {},
      }),
    ]);

    if (trendingRes.ok) {
      const data = (await trendingRes.json()) as { hubs: TrendingHub[] };
      trendingHubs = data.hubs ?? [];
    }
    if (recommendedRes.ok) {
      const data = (await recommendedRes.json()) as { hubs: RecommendedHub[] };
      recommendedHubs = data.hubs ?? [];
    }
  } catch {
    // Non-fatal — sections are simply omitted on error
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">
            Discover Hubs
          </h1>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">
            Find your people. Join a community or start your own.
          </p>
        </div>
        {session?.user && (
          <Link
            href="/h/create"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            + Create Hub
          </Link>
        )}
      </div>

      {/* Trending Now */}
      {trendingHubs.length > 0 && (
        <section aria-labelledby="trending-heading">
          <h2
            id="trending-heading"
            className="mb-3 text-base font-semibold text-[rgb(var(--fg))]"
          >
            Trending Now
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {trendingHubs.map((hub) => {
              const initial = (hub.name[0] ?? 'H').toUpperCase();
              return (
                <Link
                  key={hub.id}
                  href={`/h/${hub.slug}`}
                  className="flex shrink-0 flex-col items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4 text-center hover:border-brand-500/50 transition-colors w-36"
                >
                  <HubIcon src={hub.icon} initial={initial} size={40} />
                  <div>
                    <p className="text-sm font-semibold text-[rgb(var(--fg))] truncate max-w-[7rem]">
                      h/{hub.slug}
                    </p>
                    <p className="text-xs text-[rgb(var(--muted))]">
                      {hub.memberCount.toLocaleString()} members
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-500">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 4l8 14H4z" />
                    </svg>
                    {hub.newDropCount} new today
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Recommended for You (auth only) */}
      {userId && recommendedHubs.length > 0 && (
        <section aria-labelledby="recommended-heading">
          <h2
            id="recommended-heading"
            className="mb-3 text-base font-semibold text-[rgb(var(--fg))]"
          >
            Recommended for You
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommendedHubs.slice(0, 5).map((hub) => (
              <HubCard
                key={hub.id}
                hub={{
                  slug: hub.slug,
                  name: hub.name,
                  description: hub.description,
                  icon: hub.icon,
                  nsfw: false,
                  memberCount: hub.memberCount,
                }}
                isMember={false}
              />
            ))}
          </div>
        </section>
      )}

      {/* Sort tabs */}
      <div
        role="tablist"
        aria-label="Sort hubs"
        className="flex gap-1 border-b border-[rgb(var(--border))]"
      >
        <Link
          href="/hubs?sort=popular"
          role="tab"
          aria-selected={sort === 'popular'}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            sort === 'popular'
              ? 'border-brand-500 text-brand-500'
              : 'border-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'
          }`}
        >
          Popular
        </Link>
        <Link
          href="/hubs?sort=new"
          role="tab"
          aria-selected={sort === 'new'}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            sort === 'new'
              ? 'border-brand-500 text-brand-500'
              : 'border-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'
          }`}
        >
          New
        </Link>
      </div>

      {/* Search */}
      <HubSearch memberSlugs={memberSlugs} />

      {/* Grid */}
      {hubs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span aria-hidden="true" className="text-4xl">🌐</span>
          <p className="font-medium text-[rgb(var(--fg))]">No hubs yet.</p>
          <p className="text-sm text-[rgb(var(--muted))]">
            Be the first to create a community!
          </p>
          {session?.user && (
            <Link
              href="/h/create"
              className="mt-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
            >
              Create the first Hub
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hubs.map((hub) => (
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
  );
}
