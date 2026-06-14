import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

import { auth } from '@/lib/auth';

export const metadata: Metadata = {
  title: {
    template: '%s — PostUp Admin',
    default: 'Admin Panel — PostUp',
  },
};

interface Props {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  {
    href: '/admin',
    label: 'Dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: '/admin/users',
    label: 'Users',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/admin/hubs',
    label: 'Hubs',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    href: '/admin/reports',
    label: 'Reports',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    ),
  },
];

export default async function AdminLayout({ children }: Props) {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== 'OVERSEER') {
    redirect('/');
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <nav
        aria-label="Admin navigation"
        className="flex w-56 shrink-0 flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-6"
      >
        <div className="mb-6 px-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
            Admin Panel
          </p>
          <p className="mt-1 text-xs text-[rgb(var(--muted))]">
            u/{session.user.handle}
          </p>
        </div>

        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[rgb(var(--fg))] hover:bg-brand-500/10 hover:text-brand-500 transition-colors"
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-6">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 text-xs text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to PostUp
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto px-8 py-8">
        {children}
      </main>
    </div>
  );
}
