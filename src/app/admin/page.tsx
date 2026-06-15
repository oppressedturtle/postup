import type { Metadata } from 'next';
import Link from 'next/link';

import { db } from '@/lib/db';

export const metadata: Metadata = { title: 'Dashboard' };
// Always render from the server — never statically prerender (requires live DB).
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [totalUsers, totalHubs, totalDrops, pendingReports] = await Promise.all([
    db.user.count(),
    db.hub.count(),
    db.drop.count({ where: { isRemoved: false } }),
    db.report.count({ where: { status: 'PENDING' } }),
  ]);

  const stats = [
    {
      label: 'Total Users',
      value: totalUsers.toLocaleString(),
      href: '/admin/users',
      color: 'text-brand-500',
    },
    {
      label: 'Total Hubs',
      value: totalHubs.toLocaleString(),
      href: '/admin/hubs',
      color: 'text-brand-500',
    },
    {
      label: 'Total Drops',
      value: totalDrops.toLocaleString(),
      href: null,
      color: 'text-brand-500',
    },
    {
      label: 'Pending Reports',
      value: pendingReports.toLocaleString(),
      href: '/admin/reports',
      color: pendingReports > 0 ? 'text-red-500' : 'text-brand-500',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">Dashboard</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Site-wide overview for Overseers.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const card = (
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5">
              <p className="text-sm text-[rgb(var(--muted))]">{stat.label}</p>
              <p className={`mt-2 text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          );
          return stat.href ? (
            <Link
              key={stat.label}
              href={stat.href}
              className="block hover:scale-[1.01] transition-transform"
            >
              {card}
            </Link>
          ) : (
            <div key={stat.label}>{card}</div>
          );
        })}
      </div>

      {/* Quick links */}
      <section aria-labelledby="quick-links-heading">
        <h2
          id="quick-links-heading"
          className="mb-3 text-base font-semibold text-[rgb(var(--fg))]"
        >
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/users"
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-2 text-sm text-[rgb(var(--fg))] hover:border-brand-500/50 hover:text-brand-500 transition-colors"
          >
            Manage users
          </Link>
          <Link
            href="/admin/hubs"
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-2 text-sm text-[rgb(var(--fg))] hover:border-brand-500/50 hover:text-brand-500 transition-colors"
          >
            Manage hubs
          </Link>
          <Link
            href="/admin/reports"
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-2 text-sm text-[rgb(var(--fg))] hover:border-brand-500/50 hover:text-brand-500 transition-colors"
          >
            Review reports
          </Link>
        </div>
      </section>
    </div>
  );
}
