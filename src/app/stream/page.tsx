import type { Metadata } from 'next';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { DropFeed } from '@/components/drops/drop-feed';
import { CloutLeaderboard } from '@/components/widgets/clout-leaderboard';

export const metadata: Metadata = {
  title: 'The Stream — PostUp',
  description: 'The hottest drops from across PostUp, ranked by Heat.',
};

export default async function StreamPage() {
  const session = await auth();
  const isAuthed = !!session?.user?.id;

  const heading = isAuthed ? 'Your Stream' : 'Hot Right Now';

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">{heading}</h1>
        {isAuthed && (
          <Link
            href="/hubs"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
            title="Pick a hub to post in"
          >
            + Create Drop
          </Link>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* Feed */}
        <section aria-label="Stream feed">
          <DropFeed feedUrl="/api/stream" />
        </section>

        {/* Sidebar */}
        <aside className="space-y-4">
          <CloutLeaderboard />

          {!isAuthed && (
            <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[rgb(var(--fg))]">
                Join PostUp
              </h2>
              <p className="mb-3 text-xs text-[rgb(var(--muted))]">
                Sign up to join communities, vote on drops, and build your Clout.
              </p>
              <div className="flex flex-col gap-2">
                <Link
                  href="/register"
                  className="block rounded-lg bg-brand-500 px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-600 transition-colors"
                >
                  Get started
                </Link>
                <Link
                  href="/login"
                  className="block rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-center text-sm font-medium text-[rgb(var(--fg))] hover:bg-[rgb(var(--border))] transition-colors"
                >
                  Sign in
                </Link>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
