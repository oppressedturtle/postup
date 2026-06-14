import Link from 'next/link';
import { auth } from '@/lib/auth';

import { ThemeToggle } from './theme-toggle';
import { UserNav } from './user-nav';

export async function SiteHeader() {
  const session = await auth();
  const isAuthed = !!session?.user?.id;

  return (
    <header className="border-app bg-card/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500 text-sm text-white">
            P
          </span>
          <span className="text-fg">
            Post<span className="text-brand-500">Up</span>
          </span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/stream" className="text-muted hover:text-fg transition-colors">
            The Stream
          </Link>
          <Link href="/hubs" className="text-muted hover:text-fg transition-colors">
            Hubs
          </Link>
          {isAuthed && (
            <Link
              href="/h/create"
              className="hidden sm:block text-muted hover:text-fg transition-colors"
            >
              Create Hub
            </Link>
          )}
          {isAuthed && (
            <Link
              href="/hubs"
              title="Pick a hub to post in"
              aria-label="Create a Drop — pick a hub first"
              className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="hidden sm:inline">Create</span>
            </Link>
          )}
          <ThemeToggle />
          <UserNav />
        </nav>
      </div>
    </header>
  );
}
