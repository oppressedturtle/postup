'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DeleteDropButtonProps {
  dropId: string;
  hubSlug: string;
}

export function DeleteDropButton({ dropId, hubSlug }: DeleteDropButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Remove this drop? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/drops/${dropId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push(`/h/${hubSlug}`);
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleDelete()}
      disabled={deleting}
      className="rounded-md px-3 py-1 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
    >
      {deleting ? 'Removing…' : 'Delete'}
    </button>
  );
}
