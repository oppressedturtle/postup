import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { DropCard } from '@/components/drops/drop-card';
import type { Drop } from '@/types/drop';

export const metadata: Metadata = {
  title: 'Your Stash',
  description: 'Drops you have saved on PostUp.',
};

export default async function StashPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  const stashEntries = await db.stash.findMany({
    where: { userId },
    orderBy: { savedAt: 'desc' },
    include: {
      drop: {
        include: {
          author: {
            select: { id: true, handle: true, displayName: true, avatar: true },
          },
          hub: {
            select: { id: true, slug: true, name: true, icon: true },
          },
          _count: { select: { replies: true, votes: true } },
        },
      },
    },
  });

  // Filter out soft-deleted drops
  const validEntries = stashEntries.filter((e) => !e.drop.isRemoved);

  // Serialize dates for client components
  const drops: Drop[] = validEntries.map((e) => ({
    ...e.drop,
    linkPreview: e.drop.linkPreview as Drop['linkPreview'],
    createdAt: e.drop.createdAt.toISOString(),
    updatedAt: e.drop.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">Your Stash</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          {drops.length > 0
            ? `${drops.length} saved drop${drops.length !== 1 ? 's' : ''}`
            : 'Saved drops appear here'}
        </p>
      </div>

      {drops.length === 0 ? (
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
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <p className="font-medium text-[rgb(var(--fg))]">Your Stash is empty.</p>
          <p className="text-sm text-[rgb(var(--muted))]">
            Bookmark drops by clicking the save icon on any drop.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {drops.map((drop) => (
            <div key={drop.id} className="relative">
              <DropCard drop={drop} initialStashed={true} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
