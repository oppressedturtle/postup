'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export interface JoinButtonProps {
  hubSlug: string;
  initialIsMember: boolean;
  initialMemberCount: number;
  /** Extra CSS classes forwarded to the button element */
  className?: string;
}

export function JoinButton({
  hubSlug,
  initialIsMember,
  initialMemberCount,
  className,
}: JoinButtonProps) {
  const { status } = useSession();
  const router = useRouter();

  const [isMember, setIsMember] = useState(initialIsMember);
  const [memberCount, setMemberCount] = useState(initialMemberCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    setLoading(true);
    setError(null);

    // Optimistic update
    const nextMember = !isMember;
    const nextCount = nextMember ? memberCount + 1 : memberCount - 1;
    setIsMember(nextMember);
    setMemberCount(nextCount);

    try {
      const res = await fetch(`/api/hubs/${hubSlug}/membership`, {
        method: isMember ? 'DELETE' : 'POST',
      });

      if (!res.ok && res.status !== 204) {
        // Roll back optimistic update
        setIsMember(isMember);
        setMemberCount(memberCount);
        try {
          const data = (await res.json()) as { error?: { message: string } };
          setError(data.error?.message ?? 'Something went wrong. Please try again.');
        } catch {
          setError('Something went wrong. Please try again.');
        }
      }
    } catch {
      // Network error — roll back
      setIsMember(isMember);
      setMemberCount(memberCount);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const baseClasses =
    'inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50';

  const variantClasses = isMember
    ? 'border border-[rgb(var(--border))] text-[rgb(var(--fg))] hover:border-red-400 hover:text-red-600 dark:hover:border-red-600 dark:hover:text-red-400'
    : 'bg-brand-500 text-white hover:bg-brand-600';

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading || status === 'loading'}
        aria-label={isMember ? `Leave h/${hubSlug}` : `Join h/${hubSlug}`}
        aria-pressed={isMember}
        className={`${baseClasses} ${variantClasses} ${className ?? ''}`}
      >
        {loading ? (
          <>
            <Spinner />
            <span>{isMember ? 'Leaving…' : 'Joining…'}</span>
          </>
        ) : (
          <span>{isMember ? 'Joined' : 'Join'}</span>
        )}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
