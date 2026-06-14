'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

interface StashButtonProps {
  dropId: string;
  initialStashed: boolean;
}

export function StashButton({ dropId, initialStashed }: StashButtonProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [stashed, setStashed] = useState(initialStashed);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (status === 'loading') return;
    if (!session?.user) {
      router.push('/login');
      return;
    }

    // Optimistic update
    const next = !stashed;
    setStashed(next);
    setPending(true);

    try {
      const res = await fetch(`/api/drops/${dropId}/stash`, {
        method: next ? 'POST' : 'DELETE',
      });
      if (!res.ok) {
        // Revert on failure
        setStashed(!next);
      }
    } catch {
      setStashed(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending}
      aria-label={stashed ? 'Remove from Stash' : 'Save to Stash'}
      aria-pressed={stashed}
      className={[
        'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors disabled:opacity-50',
        stashed
          ? 'text-brand-500 hover:bg-brand-500/10'
          : 'text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))]',
      ].join(' ')}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={stashed ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      <span className="hidden sm:inline">{stashed ? 'Saved' : 'Save'}</span>
    </button>
  );
}
