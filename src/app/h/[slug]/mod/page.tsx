import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ReportsTab } from './reports-tab';
import { BansTab } from './bans-tab';
import { ModLogTab } from './mod-log-tab';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Mod Queue — h/${slug}` };
}

export default async function ModQueuePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { tab = 'reports' } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/h/${slug}/mod`);
  }

  const hub = await db.hub.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });

  if (!hub) notFound();

  const isOverseer = session.user.role === 'OVERSEER';
  let isWarden = isOverseer;

  if (!isOverseer) {
    const membership = await db.membership.findUnique({
      where: { userId_hubId: { userId: session.user.id, hubId: hub.id } },
      select: { role: true },
    });
    isWarden = membership?.role === 'WARDEN';
  }

  if (!isWarden) {
    redirect(`/h/${slug}`);
  }

  // Pending report count for badge
  const pendingReports = await db.report.count({
    where: {
      status: 'PENDING',
      OR: [
        { drop: { hubId: hub.id } },
        { reply: { drop: { hubId: hub.id } } },
      ],
    },
  });

  const tabs = [
    { key: 'reports', label: 'Reports', badge: pendingReports > 0 ? pendingReports : null },
    { key: 'bans', label: 'Banned Users', badge: null },
    { key: 'modlog', label: 'Mod Log', badge: null },
  ];

  const activeTab = tabs.find((t) => t.key === tab)?.key ?? 'reports';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/h/${hub.slug}`}
          className="text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] transition-colors"
        >
          &larr; Back to h/{hub.slug}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-[rgb(var(--fg))]">
          Mod Queue
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          h/{hub.slug} moderation tools
        </p>
      </div>

      {/* Tabs */}
      <nav
        aria-label="Mod queue sections"
        className="flex gap-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-1"
      >
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/h/${slug}/mod?tab=${t.key}`}
            aria-current={activeTab === t.key ? 'page' : undefined}
            className={[
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              activeTab === t.key
                ? 'bg-brand-500 text-white'
                : 'text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))] hover:text-[rgb(var(--fg))]',
            ].join(' ')}
          >
            {t.label}
            {t.badge !== null && (
              <span
                className={[
                  'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold',
                  activeTab === t.key
                    ? 'bg-white/20 text-white'
                    : 'bg-brand-500/10 text-brand-500',
                ].join(' ')}
              >
                {t.badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* Tab content */}
      {activeTab === 'reports' && <ReportsTab hubSlug={hub.slug} />}
      {activeTab === 'bans' && <BansTab hubSlug={hub.slug} />}
      {activeTab === 'modlog' && <ModLogTab hubSlug={hub.slug} />}
    </div>
  );
}
