import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { db } from '@/lib/db';
import { Avatar } from '@/components/user-nav';

interface Props {
  params: Promise<{ handle: string }>;
}

async function getUser(handle: string) {
  return db.user.findUnique({
    where: { handle },
    select: {
      id: true,
      handle: true,
      displayName: true,
      bio: true,
      avatar: true,
      clout: true,
      createdAt: true,
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const user = await getUser(handle);
  if (!user) {
    return { title: 'User not found' };
  }
  return {
    title: `${user.displayName} (@${user.handle})`,
    description:
      user.bio ??
      `Check out ${user.displayName}'s profile on PostUp.`,
  };
}

export default async function UserProfilePage({ params }: Props) {
  const { handle } = await params;
  const user = await getUser(handle);

  if (!user) notFound();

  const joinedDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(user.createdAt);

  const initials = user.displayName.slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Profile card */}
      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <Avatar src={user.avatar ?? null} initials={initials} size={80} />

          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">
              {user.displayName}
            </h1>
            <p className="text-sm text-[rgb(var(--muted))]">@{user.handle}</p>

            {user.bio && (
              <p className="mt-3 text-sm text-[rgb(var(--fg))]">{user.bio}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-center gap-4 sm:justify-start">
              <div className="flex items-center gap-1 text-sm">
                <span aria-hidden="true">🔥</span>
                <span className="font-semibold text-[rgb(var(--fg))]">
                  {user.clout.toLocaleString()}
                </span>
                <span className="text-[rgb(var(--muted))]">clout</span>
              </div>

              <div className="text-sm text-[rgb(var(--muted))]">
                Joined {joinedDate}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div
          role="tablist"
          aria-label="Profile sections"
          className="flex gap-1 border-b border-[rgb(var(--border))]"
        >
          <button
            role="tab"
            aria-selected="true"
            type="button"
            className="border-b-2 border-brand-500 px-4 py-2 text-sm font-medium text-brand-500"
          >
            Drops
          </button>
          <button
            role="tab"
            aria-selected="false"
            type="button"
            className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] transition-colors"
          >
            Replies
          </button>
        </div>

        {/* Drops empty state */}
        <div
          role="tabpanel"
          className="mt-6 flex flex-col items-center gap-2 py-12 text-center"
        >
          <span aria-hidden="true" className="text-4xl">
            📭
          </span>
          <p className="font-medium text-[rgb(var(--fg))]">No Drops yet</p>
          <p className="text-sm text-[rgb(var(--muted))]">
            {user.displayName} hasn&apos;t posted any Drops yet.
          </p>
        </div>
      </div>
    </div>
  );
}
