import Link from 'next/link';
import type { Metadata } from 'next';

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { HubCard } from '@/components/hubs/hub-card';
import { HubSearch } from './hub-search';

export const metadata: Metadata = {
  title: 'Discover Hubs',
  description: 'Browse and join communities on PostUp.',
};

type SortParam = 'popular' | 'new';

interface Props {
  searchParams: Promise<{ sort?: string }>;
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

  // Get the current user's memberships for join button state
  let memberSlugs = new Set<string>();
  if (session?.user?.id) {
    const memberships = await db.membership.findMany({
      where: { userId: session.user.id },
      include: { hub: { select: { slug: true } } },
    });
    memberSlugs = new Set(memberships.map((m) => m.hub.slug));
  }

  return (
    <div className="space-y-6">
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
