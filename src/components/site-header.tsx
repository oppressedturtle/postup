'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { ThemeToggle } from './theme-toggle';
import { UserNav } from './user-nav';
import { NotificationsBell } from './notifications/notifications-bell';
import { SearchBar } from './search/search-bar';
import { MobileNav } from './mobile-nav';

export function SiteHeader() {
  const { data: session } = useSession();
  const isAuthed = !!session?.user?.id;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <header className="border-app bg-card/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileNavOpen(true)}
            className="sm:hidden flex items-center justify-center rounded-lg p-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:bg-brand-500/10 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2 font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500 text-sm text-white">
              P
            </span>
            <span className="text-fg hidden sm:block">
              Post<span className="text-brand-500">Up</span>
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav aria-label="Main" className="hidden sm:flex items-center gap-3 text-sm shrink-0">
            <Link href="/stream" className="text-muted hover:text-fg transition-colors">
              The Stream
            </Link>
            <Link href="/hubs" className="text-muted hover:text-fg transition-colors">
              Hubs
            </Link>
            {isAuthed && (
              <Link
                href="/h/create"
                className="hidden lg:block text-muted hover:text-fg transition-colors"
              >
                Create Hub
              </Link>
            )}
          </nav>

          {/* Search bar — grows to fill space */}
          <div className="flex-1 min-w-0 flex justify-center px-2">
            <SearchBar />
          </div>

          {/* Right side controls */}
          <nav aria-label="User" className="flex items-center gap-1 shrink-0">
            {isAuthed && (
              <Link
                href="/hubs"
                title="Pick a hub to post in"
                aria-label="Create a Drop — pick a hub first"
                className="hidden sm:flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span className="hidden md:inline">Create</span>
              </Link>
            )}
            <ThemeToggle />
            {isAuthed && (
              <Link
                href="/notifications"
                aria-label="Notifications"
                className="relative flex items-center justify-center rounded-lg p-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:bg-brand-500/10 transition-colors sm:hidden"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </Link>
            )}
            {isAuthed && (
              <span className="hidden sm:block">
                <NotificationsBell />
              </span>
            )}
            <UserNav />
          </nav>
        </div>
      </header>

      {/* Mobile drawer */}
      <div id="mobile-nav">
        <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      </div>
    </>
  );
}
