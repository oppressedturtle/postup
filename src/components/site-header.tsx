import Link from 'next/link';

import { ThemeToggle } from './theme-toggle';
import { UserNav } from './user-nav';

export function SiteHeader() {
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
          <Link href="/" className="text-muted hover:text-fg">
            The Stream
          </Link>
          <ThemeToggle />
          <UserNav />
        </nav>
      </div>
    </header>
  );
}
