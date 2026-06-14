'use client';

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminHub {
  id: string;
  name: string;
  slug: string;
  description: string;
  nsfw: boolean;
  createdAt: string;
  _count: { memberships: number; drops: number };
  creator: { handle: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateStr));
}

// ---------------------------------------------------------------------------
// Delete confirmation modal (type-to-confirm)
// ---------------------------------------------------------------------------

interface DeleteModalProps {
  hubName: string;
  hubSlug: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ hubName, hubSlug, onConfirm, onCancel }: DeleteModalProps) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const confirmed = typed === hubSlug;

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-hub-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-xl"
      >
        <h2 id="delete-hub-title" className="text-base font-semibold text-red-500">
          Delete h/{hubSlug}
        </h2>
        <p className="mt-2 text-sm text-[rgb(var(--muted))]">
          This will permanently delete <strong className="text-[rgb(var(--fg))]">{hubName}</strong> and all its drops, replies, and memberships. This action cannot be undone.
        </p>
        <div className="mt-4">
          <label
            htmlFor="delete-confirm-input"
            className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]"
          >
            Type <strong>{hubSlug}</strong> to confirm:
          </label>
          <input
            ref={inputRef}
            id="delete-confirm-input"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={hubSlug}
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm text-[rgb(var(--fg))] hover:bg-[rgb(var(--border))] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!confirmed}
            onClick={onConfirm}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-40"
          >
            Delete Hub
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// AdminHubsPage
// ---------------------------------------------------------------------------

export default function AdminHubsPage() {
  const [hubs, setHubs] = useState<AdminHub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminHub | null>(null);

  useEffect(() => {
    void fetchHubs();
  }, []);

  async function fetchHubs() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/hubs');
      if (!res.ok) throw new Error('Failed to load hubs');
      const data = (await res.json()) as { hubs: AdminHub[] };
      setHubs(data.hubs);
    } catch {
      setError('Failed to load hubs. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(hub: AdminHub) {
    setDeleting(hub.slug);
    setDeleteTarget(null);
    try {
      const res = await fetch(`/api/admin/hubs/${hub.slug}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Deleted by Overseer via admin panel' }),
      });
      if (res.ok || res.status === 204) {
        setHubs((prev) => prev.filter((h) => h.slug !== hub.slug));
      }
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">Hubs</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          All communities on PostUp.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-[rgb(var(--border))]" aria-hidden="true" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button
            type="button"
            onClick={() => void fetchHubs()}
            className="mt-2 text-sm text-brand-500 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : hubs.length === 0 ? (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-8 text-center">
          <p className="text-sm text-[rgb(var(--muted))]">No hubs found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))] text-xs text-[rgb(var(--muted))]">
                <th className="px-4 py-3 text-left font-medium">Hub</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Members</th>
                <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Drops</th>
                <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Created</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {hubs.map((hub) => (
                <tr key={hub.id} className="hover:bg-[rgb(var(--border))]/20 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[rgb(var(--fg))]">h/{hub.slug}</span>
                        {hub.nsfw && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                            NSFW
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[rgb(var(--muted))]">by u/{hub.creator.handle}</p>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className="text-[rgb(var(--muted))]">{hub._count.memberships.toLocaleString()}</span>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className="text-[rgb(var(--muted))]">{hub._count.drops.toLocaleString()}</span>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <span className="text-[rgb(var(--muted))]">{relativeDate(hub.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={deleting === hub.slug}
                      onClick={() => setDeleteTarget(hub)}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                    >
                      {deleting === hub.slug ? 'Deleting…' : 'Delete Hub'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          hubName={deleteTarget.name}
          hubSlug={deleteTarget.slug}
          onConfirm={() => void handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
