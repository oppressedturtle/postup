import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { db } from '@/lib/db';
import { Avatar } from '@/components/user-nav';
import { ProfileTabs } from './profile-tabs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ handle: string }>;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

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

async function getUserDrops(userId: string) {
  const drops = await db.drop.findMany({
    where: { authorId: userId, isRemoved: false },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      title: true,
      type: true,
      heat: true,
      createdAt: true,
      hub: { select: { slug: true, name: true } },
      _count: { select: { replies: true } },
    },
  });
  return drops.map((d) => ({
    ...d,
    createdAt: d.createdAt.toISOString(),
  }));
}

async function getUserReplies(userId: string) {
  const replies = await db.reply.findMany({
    where: { authorId: userId, isRemoved: false },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      body: true,
      heat: true,
      createdAt: true,
      drop: {
        select: {
          id: true,
          title: true,
          hub: { select: { slug: true, name: true } },
        },
      },
    },
  });
  return replies.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function UserProfilePage({ params }: Props) {
  const { handle } = await params;
  const user = await getUser(handle);

  if (!user) notFound();

  const [drops, replies] = await Promise.all([
    getUserDrops(user.id),
    getUserReplies(user.id),
  ]);

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
      <ProfileTabs
        handle={user.handle}
        displayName={user.displayName}
        drops={drops}
        replies={replies}
      />
    </div>
  );
}
