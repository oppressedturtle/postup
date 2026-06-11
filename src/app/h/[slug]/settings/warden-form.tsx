'use client';

import { useState, useId } from 'react';
import Link from 'next/link';

interface Warden {
  id: string;
  role: string;
  user: {
    handle: string;
    avatar: string | null;
    clout: number;
  };
}

interface Props {
  hubSlug: string;
  initialWardens: Warden[];
  /** Whether the current user is the OVERSEER or the hub creator */
  canDemote: boolean;
  /** The hub creator's user ID — cannot be demoted */
  creatorHandle: string;
}

export function WardenForm({
  hubSlug,
  initialWardens,
  canDemote,
  creatorHandle,
}: Props) {
  const promoteInputId = useId();
  const [wardens, setWardens] = useState<Warden[]>(initialWardens);
  const [promoteHandle, setPromoteHandle] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoteSuccess, setPromoteSuccess] = useState<string | null>(null);
  const [demotingId, setDemotingId] = useState<string | null>(null);
  const [demoteError, setDemoteError] = useState<string | null>(null);

  async function handlePromote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!promoteHandle.trim()) return;

    setPromoting(true);
    setPromoteError(null);
    setPromoteSuccess(null);

    try {
      const res = await fetch(`/api/hubs/${hubSlug}/wardens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: promoteHandle.trim() }),
      });

      const data = (await res.json()) as {
        membership?: Warden;
        error?: { message: string };
      };

      if (res.ok && data.membership) {
        setPromoteSuccess(`u/${promoteHandle.trim()} is now a Warden.`);
        setPromoteHandle('');
        // Refresh warden list via API
        void refreshWardens();
        setTimeout(() => setPromoteSuccess(null), 4000);
      } else {
        setPromoteError(data.error?.message ?? 'Promotion failed.');
      }
    } catch {
      setPromoteError('Network error. Please try again.');
    } finally {
      setPromoting(false);
    }
  }

  async function refreshWardens() {
    try {
      const res = await fetch(`/api/hubs/${hubSlug}/members?role=WARDEN&limit=50`);
      if (res.ok) {
        const data = (await res.json()) as { members: Warden[] };
        setWardens(data.members);
      }
    } catch {
      // Non-fatal — list may be slightly stale
    }
  }

  async function handleDemote(handle: string) {
    setDemotingId(handle);
    setDemoteError(null);

    try {
      const res = await fetch(`/api/hubs/${hubSlug}/wardens`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });

      if (res.ok) {
        setWardens((prev) => prev.filter((w) => w.user.handle !== handle));
      } else {
        const data = (await res.json()) as { error?: { message: string } };
        setDemoteError(data.error?.message ?? 'Demotion failed.');
      }
    } catch {
      setDemoteError('Network error. Please try again.');
    } finally {
      setDemotingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Current wardens list */}
      <ul aria-label="Current wardens" className="space-y-2">
        {wardens.map((w) => (
          <li
            key={w.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-[rgb(var(--border))] px-3 py-2"
          >
            <Link
              href={`/u/${w.user.handle}`}
              className="text-sm font-medium text-brand-500 hover:underline"
            >
              u/{w.user.handle}
            </Link>
            {canDemote && w.user.handle !== creatorHandle && (
              <button
                type="button"
                onClick={() => void handleDemote(w.user.handle)}
                disabled={demotingId === w.user.handle}
                className="rounded px-2 py-1 text-xs font-medium text-[rgb(var(--muted))] hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {demotingId === w.user.handle ? 'Removing…' : 'Remove'}
              </button>
            )}
          </li>
        ))}
        {wardens.length === 0 && (
          <li className="text-sm text-[rgb(var(--muted))]">No wardens found.</li>
        )}
      </ul>

      {demoteError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {demoteError}
        </p>
      )}

      {/* Promote by handle */}
      <form onSubmit={(e) => void handlePromote(e)} className="space-y-2">
        <label
          htmlFor={promoteInputId}
          className="block text-sm font-medium text-[rgb(var(--fg))]"
        >
          Promote a member to Warden
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[rgb(var(--muted))]"
            >
              u/
            </span>
            <input
              id={promoteInputId}
              type="text"
              value={promoteHandle}
              onChange={(e) => setPromoteHandle(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="username"
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] py-2 pl-8 pr-3 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={promoting || !promoteHandle.trim()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {promoting ? 'Promoting…' : 'Promote'}
          </button>
        </div>
        {promoteError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {promoteError}
          </p>
        )}
        {promoteSuccess && (
          <p role="status" className="text-sm text-green-600 dark:text-green-400">
            {promoteSuccess}
          </p>
        )}
      </form>
    </div>
  );
}
