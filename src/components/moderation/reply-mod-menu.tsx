'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplyModMenuProps {
  replyId: string;
  isRemoved: boolean;
  userRole?: string;
  userHubRole?: string;
  onUpdate?: (isRemoved: boolean) => void;
}

// ---------------------------------------------------------------------------
// ReplyModMenu
// ---------------------------------------------------------------------------

export function ReplyModMenu({ replyId, isRemoved: initialRemoved, userRole, userHubRole, onUpdate }: ReplyModMenuProps) {
  const isOverseer = userRole === 'OVERSEER';
  const isWarden = userHubRole === 'WARDEN';

  if (!isOverseer && !isWarden) return null;

  return (
    <ReplyModMenuInner
      replyId={replyId}
      initialRemoved={initialRemoved}
      onUpdate={onUpdate}
    />
  );
}

function ReplyModMenuInner({
  replyId,
  initialRemoved,
  onUpdate,
}: {
  replyId: string;
  initialRemoved: boolean;
  onUpdate?: (isRemoved: boolean) => void;
}) {
  const [isRemoved, setIsRemoved] = useState(initialRemoved);
  const [loading, setLoading] = useState(false);

  async function applyAction(action: 'remove' | 'restore') {
    if (action === 'remove') {
      if (!confirm('Remove this reply? The content will be hidden from users.')) return;
    }
    setLoading(true);

    const next = action === 'remove';
    setIsRemoved(next);
    onUpdate?.(next);

    try {
      const res = await fetch(`/api/replies/${replyId}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        // Revert
        setIsRemoved(initialRemoved);
        onUpdate?.(initialRemoved);
      }
    } catch {
      setIsRemoved(initialRemoved);
      onUpdate?.(initialRemoved);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void applyAction(isRemoved ? 'restore' : 'remove')}
      disabled={loading}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
    >
      {loading ? '…' : isRemoved ? 'Restore' : 'Mod Remove'}
    </button>
  );
}
