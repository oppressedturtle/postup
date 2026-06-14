import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { HubIcon } from '@/components/hubs/hub-card';
import { JoinButton } from '@/components/hubs/join-button';
import { DropFeed } from '@/components/drops/drop-feed';
import { CloutLeaderboard } from '@/components/widgets/clout-leaderboard';

interface Props {
  params: Promise<{ slug: string }>;
}

async function getHub(slug: string) {
  return db.hub.findUnique({
    where: { slug },
    include: {
      _count: { select: { memberships: true, drops: true } },
      creator: { select: { handle: true } },
      memberships: {
        where: { role: 'WARDEN' },
        take: 5,
        include: {
          user: { select: { handle: true, avatar: true } },
        },
        orderBy: { joinedAt: 'asc' },
      },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const hub = await getHub(slug);
  if (!hub) return { title: 'Hub not found' };
  return {
    title: `h/${hub.slug}`,
    description: hub.description || `Welcome to h/${hub.slug} on PostUp.`,
    openGraph: {
      title: `h/${hub.slug} — PostUp`,
      description: hub.description || `Welcome to h/${hub.slug} on PostUp.`,
      images: [
        {
          url: `/api/og?title=${encodeURIComponent('h/' + hub.slug)}&description=${encodeURIComponent(hub.description)}&type=hub`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `h/${hub.slug} — PostUp`,
      description: hub.description || `Welcome to h/${hub.slug} on PostUp.`,
    },
  };
}

export default async function HubPage({ params }: Props) {
  const { slug } = await params;

  const [hub, session] = await Promise.all([getHub(slug), auth()]);

  if (!hub) notFound();

  const userId = session?.user?.id ?? null;
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const isOverseerRole = userRole === 'OVERSEER';

  // Determine if the current user is a member and/or warden
  let isMember = false;
  let isWardenOfHub = isOverseerRole;
  if (userId) {
    const membership = await db.membership.findUnique({
      where: { userId_hubId: { userId, hubId: hub.id } },
      select: { id: true, role: true },
    });
    isMember = membership !== null;
    if (!isOverseerRole && membership?.role === 'WARDEN') {
      isWardenOfHub = true;
    }
  }

  // Pending report count for sidebar badge (only fetched for wardens)
  let pendingReportCount = 0;
  if (isWardenOfHub) {
    pendingReportCount = await db.report.count({
      where: {
        status: 'PENDING',
        OR: [
          { drop: { hubId: hub.id } },
          { reply: { drop: { hubId: hub.id } } },
        ],
      },
    });
  }

  const memberCount = hub._count.memberships;
  const dropCount = hub._count.drops;
  const initial = (hub.name[0] ?? 'H').toUpperCase();

  const createdDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(hub.createdAt);

  return (
    <div className="space-y-0">
      {/* NSFW warning */}
      {hub.nsfw && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          <strong>NSFW Community</strong> — This hub contains content intended for
          adults only. Proceed with discretion.
        </div>
      )}

      {/* Banner */}
      <div
        aria-hidden="true"
        className="relative h-[200px] w-full overflow-hidden rounded-t-xl"
        style={
          hub.banner
            ? undefined
            : {
                background:
                  'linear-gradient(135deg, rgb(249 86 18) 0%, rgb(234 61 8) 100%)',
              }
        }
      >
        {hub.banner && (
          // Using regular img here for banner since it's a user-provided URL
          // that may not fit Next/Image domain config
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hub.banner}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {/* Hub header card */}
      <div className="border-app bg-card rounded-b-xl border border-t-0 px-6 pb-5 pt-0">
        {/* Icon overlapping banner */}
        <div className="-mt-8 mb-3 flex items-end justify-between gap-4">
          <div className="rounded-full border-4 border-[rgb(var(--card))]">
            <HubIcon src={hub.icon} initial={initial} size={64} />
          </div>
          <div className="pb-1">
            <JoinButton
              hubSlug={hub.slug}
              initialIsMember={isMember}
              initialMemberCount={memberCount}
            />
          </div>
        </div>

        {/* Name + meta */}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-[rgb(var(--fg))]">
            h/{hub.slug}
          </h1>
          {hub.nsfw && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
              NSFW
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-4 text-sm text-[rgb(var(--muted))]">
          <span>
            <strong className="text-[rgb(var(--fg))]">
              {memberCount.toLocaleString()}
            </strong>{' '}
            member{memberCount !== 1 ? 's' : ''}
          </span>
          <span>
            <strong className="text-[rgb(var(--fg))]">
              {dropCount.toLocaleString()}
            </strong>{' '}
            drop{dropCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* Main — Drops feed */}
        <section aria-label="Drops feed">
          <DropFeed hubSlug={hub.slug} />
        </section>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* About */}
          <section
            aria-labelledby="about-heading"
            className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4"
          >
            <h2
              id="about-heading"
              className="mb-2 text-sm font-semibold text-[rgb(var(--fg))]"
            >
              About h/{hub.slug}
            </h2>
            {hub.description ? (
              <p className="text-sm text-[rgb(var(--fg))]">{hub.description}</p>
            ) : (
              <p className="text-sm text-[rgb(var(--muted))]">
                No description yet.
              </p>
            )}

            {hub.rules && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] transition-colors">
                  Community rules
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-xs text-[rgb(var(--fg))]">
                  {hub.rules}
                </p>
              </details>
            )}
          </section>

          {/* Stats */}
          <section
            aria-labelledby="stats-heading"
            className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4"
          >
            <h2
              id="stats-heading"
              className="mb-3 text-sm font-semibold text-[rgb(var(--fg))]"
            >
              Hub stats
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[rgb(var(--muted))]">Members</dt>
                <dd className="font-medium text-[rgb(var(--fg))]">
                  {memberCount.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[rgb(var(--muted))]">Drops</dt>
                <dd className="font-medium text-[rgb(var(--fg))]">
                  {dropCount.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[rgb(var(--muted))]">Created</dt>
                <dd className="font-medium text-[rgb(var(--fg))]">
                  {createdDate}
                </dd>
              </div>
            </dl>
          </section>

          {/* Wardens */}
          {hub.memberships.length > 0 && (
            <section
              aria-labelledby="wardens-heading"
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4"
            >
              <h2
                id="wardens-heading"
                className="mb-3 text-sm font-semibold text-[rgb(var(--fg))]"
              >
                Wardens
              </h2>
              <ul className="space-y-2">
                {hub.memberships.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/u/${m.user.handle}`}
                      className="text-sm text-brand-500 hover:underline"
                    >
                      u/{m.user.handle}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Create Drop CTA (members only) */}
          {isMember && (
            <Link
              href={`/h/${hub.slug}/submit`}
              className="block rounded-xl border border-brand-500/30 bg-brand-500/5 p-4 text-center text-sm font-medium text-brand-500 hover:bg-brand-500/10 transition-colors"
            >
              + Create a Drop in h/{hub.slug}
            </Link>
          )}

          {/* Mod Queue link — wardens & overseers only */}
          {isWardenOfHub && (
            <Link
              href={`/h/${hub.slug}/mod`}
              className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4 text-sm font-medium text-[rgb(var(--fg))] hover:border-brand-500/50 hover:text-brand-500 transition-colors"
            >
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Mod Queue
              </span>
              {pendingReportCount > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">
                  {pendingReportCount}
                </span>
              )}
            </Link>
          )}

          {/* Top Contributors leaderboard */}
          <CloutLeaderboard />
        </aside>
      </div>
    </div>
  );
}
