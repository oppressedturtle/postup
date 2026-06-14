import Link from 'next/link';

import { auth } from '@/lib/auth';
import { DropFeed } from '@/components/drops/drop-feed';
import { CloutLeaderboard } from '@/components/widgets/clout-leaderboard';

const FEATURES = [
  {
    name: 'Hubs',
    blurb: 'Spin up a community at h/yourthing and gather your people.',
  },
  {
    name: 'Drops',
    blurb: 'Post text, images, video, or links — with rich previews.',
  },
  {
    name: 'Boost & Bury',
    blurb: 'Vote on what matters. Heat rises, noise sinks.',
  },
  {
    name: 'Clout',
    blurb: 'Earn reputation when the community Boosts your Drops.',
  },
];

export default async function HomePage() {
  const session = await auth();
  const isAuthed = !!session?.user?.id;

  if (isAuthed) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">The Stream</h1>
          <Link
            href="/hubs"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
            title="Pick a hub to post in"
          >
            + Create Drop
          </Link>
        </div>

        {/* Two-column layout for authenticated users */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          <section aria-label="Stream feed">
            <DropFeed />
          </section>
          <aside className="space-y-4">
            <CloutLeaderboard />
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Where communities <span className="text-brand-500">heat up</span>.
        </h1>
        <p className="text-muted mx-auto mt-4 max-w-xl text-lg">
          PostUp is a place to start Hubs, share Drops, and let the best stuff
          rise. Sign up to join the conversation.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/register"
            className="rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
          >
            Get started
          </Link>
          <Link
            href="/hubs"
            className="rounded-lg border border-[rgb(var(--border))] px-6 py-2.5 text-sm font-medium text-[rgb(var(--fg))] hover:bg-[rgb(var(--border))] transition-colors"
          >
            Browse Hubs
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <article
            key={f.name}
            className="border-app bg-card rounded-xl border p-5"
          >
            <h2 className="font-semibold text-brand-500">{f.name}</h2>
            <p className="text-muted mt-1 text-sm">{f.blurb}</p>
          </article>
        ))}
      </section>

      {/* Feed preview with sidebar */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[rgb(var(--fg))]">
          Recent Drops
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          <div>
            <DropFeed initialSort="fresh" />
          </div>
          <aside className="space-y-4">
            <CloutLeaderboard />
          </aside>
        </div>
      </section>
    </div>
  );
}
