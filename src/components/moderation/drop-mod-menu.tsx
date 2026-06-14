'use client';

import { useEffect, useRef, useState } from 'react';
import type { Drop } from '@/types/drop';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DropModMenuProps {
  drop: Drop;
  userRole?: string;
  userHubRole?: string;
}

type ModAction = 'pin' | 'unpin' | 'lock' | 'unlock' | 'remove' | 'restore';

interface PartialDrop {
  isPinned: boolean;
  isLocked: boolean;
  isRemoved: boolean;
}

// ---------------------------------------------------------------------------
// DropModMenu
// ---------------------------------------------------------------------------

export function DropModMenu({ drop, userRole, userHubRole }: DropModMenuProps) {
  const isOverseer = userRole === 'OVERSEER';
  const isWarden = userHubRole === 'WARDEN';

  if (!isOverseer && !isWarden) return null;

  return <DropModMenuInner drop={drop} />;
}

function DropModMenuInner({ drop }: { drop: Drop }) {
  const [open, setOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<PartialDrop>({
    isPinned: drop.isPinned,
    isLocked: drop.isLocked,
    isRemoved: drop.isRemoved,
  });
  const [loading, setLoading] = useState<ModAction | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function applyAction(action: ModAction) {
    if (action === 'remove') {
      if (!confirm('Remove this drop? The content will be hidden from users.')) return;
    }

    setLoading(action);
    setOpen(false);

    // Optimistic update
    const next: PartialDrop = { ...optimistic };
    if (action === 'pin') next.isPinned = true;
    if (action === 'unpin') next.isPinned = false;
    if (action === 'lock') next.isLocked = true;
    if (action === 'unlock') next.isLocked = false;
    if (action === 'remove') next.isRemoved = true;
    if (action === 'restore') next.isRemoved = false;
    setOptimistic(next);

    try {
      const res = await fetch(`/api/drops/${drop.id}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        // Revert optimistic update
        setOptimistic({ isPinned: drop.isPinned, isLocked: drop.isLocked, isRemoved: drop.isRemoved });
      }
    } catch {
      setOptimistic({ isPinned: drop.isPinned, isLocked: drop.isLocked, isRemoved: drop.isRemoved });
    } finally {
      setLoading(null);
    }
  }

  const { isPinned, isLocked, isRemoved } = optimistic;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Moderation actions"
        disabled={loading !== null}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))] hover:text-[rgb(var(--fg))] transition-colors disabled:opacity-50"
      >
        {/* Settings/gear icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Mod
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Moderation actions"
          className="absolute left-0 top-full z-20 mt-1 min-w-[140px] rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] py-1 shadow-lg"
        >
          {/* Pin / Unpin */}
          <button
            type="button"
            role="menuitem"
            onClick={() => void applyAction(isPinned ? 'unpin' : 'pin')}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[rgb(var(--fg))] hover:bg-brand-500/10 transition-colors"
          >
            {isPinned ? 'Unpin' : 'Pin'}
          </button>

          {/* Lock / Unlock */}
          <button
            type="button"
            role="menuitem"
            onClick={() => void applyAction(isLocked ? 'unlock' : 'lock')}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[rgb(var(--fg))] hover:bg-brand-500/10 transition-colors"
          >
            {isLocked ? 'Unlock' : 'Lock'}
          </button>

          <div className="my-1 border-t border-[rgb(var(--border))]" />

          {/* Remove / Restore */}
          <button
            type="button"
            role="menuitem"
            onClick={() => void applyAction(isRemoved ? 'restore' : 'remove')}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            {isRemoved ? 'Restore' : 'Remove'}
          </button>
        </div>
      )}
    </div>
  );
}
