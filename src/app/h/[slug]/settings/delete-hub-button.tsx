'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  hubSlug: string;
}

export function DeleteHubButton({ hubSlug }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/hubs/${hubSlug}`, { method: 'DELETE' });

      if (res.status === 204) {
        router.push('/hubs');
        router.refresh();
        return;
      }

      const data = (await res.json()) as { error?: { message: string } };
      setError(data.error?.message ?? 'Delete failed. Please try again.');
      setConfirming(false);
    } catch {
      setError('Network error. Please try again.');
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          Delete Hub
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
      <p className="text-sm font-medium text-red-800 dark:text-red-200">
        Are you absolutely sure? This will permanently delete{' '}
        <strong>h/{hubSlug}</strong> and all its Drops, replies, and member data.
        This action cannot be undone.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          {deleting ? 'Deleting…' : 'Yes, delete forever'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--fg))] hover:bg-[rgb(var(--border))]/20 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
