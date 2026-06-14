'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';

export function UserNav() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  if (status === 'loading') {
    return (
      <div className="h-8 w-8 animate-pulse rounded-full bg-[rgb(var(--border))]" />
    );
  }

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-[rgb(var(--fg))] hover:bg-brand-500/10 transition-colors"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
        >
          Sign up
        </Link>
      </div>
    );
  }

  const { user } = session;
  const initials = (user.name ?? user.handle ?? 'U')
    .slice(0, 2)
    .toUpperCase();
  const isOverseer = (user as { role?: string }).role === 'OVERSEER';

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`User menu for ${user.handle}`}
        className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-brand-500/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Avatar src={user.image ?? null} initials={initials} size={32} />
        <span className="hidden text-[rgb(var(--fg))] sm:block font-medium">
          {user.handle}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="User menu"
          className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] py-1 shadow-lg"
        >
          <div className="border-b border-[rgb(var(--border))] px-3 py-2">
            <p className="text-sm font-medium text-[rgb(var(--fg))]">
              {user.name ?? user.handle}
            </p>
            <p className="text-xs text-[rgb(var(--muted))]">u/{user.handle}</p>
          </div>

          <Link
            href={`/u/${user.handle}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[rgb(var(--fg))] hover:bg-brand-500/10 transition-colors"
          >
            View profile
          </Link>

          <Link
            href="/stash"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[rgb(var(--fg))] hover:bg-brand-500/10 transition-colors"
          >
            My Stash
          </Link>

          <Link
            href="/notifications"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[rgb(var(--fg))] hover:bg-brand-500/10 transition-colors"
          >
            Notifications
          </Link>

          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[rgb(var(--fg))] hover:bg-brand-500/10 transition-colors"
          >
            Settings
          </Link>

          {isOverseer && (
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-brand-500 hover:bg-brand-500/10 transition-colors"
            >
              Admin Panel
            </Link>
          )}

          <div className="border-t border-[rgb(var(--border))] mt-1 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void signOut({ redirectTo: '/' });
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface AvatarProps {
  src: string | null;
  initials: string;
  size: number;
}

export function Avatar({ src, initials, size }: AvatarProps) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-500 font-semibold text-white"
    >
      {initials}
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-[rgb(var(--muted))] transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M2 4l4 4 4-4" />
    </svg>
  );
}
