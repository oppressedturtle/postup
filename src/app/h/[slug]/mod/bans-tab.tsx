'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BanItem {
  id: string;
  reason: string | null;
  createdAt: string;
  user: { handle: string; avatar: string | null; displayName: string };
}

interface BansTabProps {
  hubSlug: string;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function Avatar({ src, handle }: { src: string | null; handle: string }) {
  const initials = handle.slice(0, 2).toUpperCase();
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={32}
        height={32}
        className="rounded-full object-cover"
        style={{ width: 32, height: 32 }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white"
    >
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// BansTab
// ---------------------------------------------------------------------------

export function BansTab({ hubSlug }: BansTabProps) {
  const [bans, setBans] = useState<BanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unbanning, setUnbanning] = useState<Record<string, boolean>>({});

  // Ban form state
  const [banHandle, setBanHandle] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);
  const [banError, setBanError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBans();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubSlug]);

  async function fetchBans() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hubs/${hubSlug}/bans`);
      if (!res.ok) throw new Error('Failed to load bans');
      const data = (await res.json()) as { bans: BanItem[] };
      setBans(data.bans);
    } catch {
      setError('Failed to load bans. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUnban(handle: string) {
    setUnbanning((prev) => ({ ...prev, [handle]: true }));
    try {
      const res = await fetch(`/api/hubs/${hubSlug}/bans`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });
      if (res.ok) {
        setBans((prev) => prev.filter((b) => b.user.handle !== handle));
      }
    } catch {
      // silent
    } finally {
      setUnbanning((prev) => ({ ...prev, [handle]: false }));
    }
  }

  async function handleBan(e: React.FormEvent) {
    e.preventDefault();
    setBanError(null);
    if (!banHandle.trim()) return;
    setBanning(true);
    try {
      const res = await fetch(`/api/hubs/${hubSlug}/bans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: banHandle.trim(),
          reason: banReason.trim() || undefined,
        }),
      });

      if (res.status === 409) {
        setBanError('This user is already banned.');
        return;
      }
      if (res.status === 404) {
        setBanError('User not found.');
        return;
      }
      if (!res.ok) {
        setBanError('Failed to ban user. Please try again.');
        return;
      }

      const data = (await res.json()) as { ban: BanItem };
      setBans((prev) => [data.ban, ...prev]);
      setBanHandle('');
      setBanReason('');
    } catch {
      setBanError('Failed to ban user. Please try again.');
    } finally {
      setBanning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Ban form */}
      <section
        aria-labelledby="ban-form-heading"
        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5"
      >
        <h2
          id="ban-form-heading"
          className="mb-4 text-sm font-semibold text-[rgb(var(--fg))]"
        >
          Ban a user
        </h2>
        <form onSubmit={(e) => void handleBan(e)} className="space-y-3">
          <div>
            <label
              htmlFor="ban-handle"
              className="mb-1 block text-xs font-medium text-[rgb(var(--muted))]"
            >
              Username (handle)
            </label>
            <input
              id="ban-handle"
              type="text"
              value={banHandle}
              onChange={(e) => setBanHandle(e.target.value)}
              placeholder="username"
              maxLength={20}
              required
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label
              htmlFor="ban-reason"
              className="mb-1 block text-xs font-medium text-[rgb(var(--muted))]"
            >
              Reason <span className="font-normal">(optional)</span>
            </label>
            <textarea
              id="ban-reason"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason for ban…"
              rows={2}
              maxLength={1000}
              className="w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {banError && (
            <p className="text-sm text-red-500">{banError}</p>
          )}

          <button
            type="submit"
            disabled={banning || !banHandle.trim()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
          >
            {banning ? 'Banning…' : 'Ban User'}
          </button>
        </form>
      </section>

      {/* Banned users list */}
      <section aria-labelledby="bans-list-heading">
        <h2
          id="bans-list-heading"
          className="mb-3 text-sm font-semibold text-[rgb(var(--fg))]"
        >
          Banned Users
        </h2>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-[rgb(var(--border))]"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button
              type="button"
              onClick={() => void fetchBans()}
              className="mt-2 text-sm text-brand-500 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : bans.length === 0 ? (
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-8 text-center">
            <p className="text-sm text-[rgb(var(--muted))]">No banned users.</p>
          </div>
        ) : (
          <div className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))]">
            {bans.map((ban) => (
              <div key={ban.id} className="flex items-center gap-3 p-4">
                <Avatar src={ban.user.avatar} handle={ban.user.handle} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[rgb(var(--fg))]">
                    u/{ban.user.handle}
                  </p>
                  {ban.reason && (
                    <p className="text-xs text-[rgb(var(--muted))] truncate">
                      {ban.reason}
                    </p>
                  )}
                  <p className="text-xs text-[rgb(var(--muted))]">
                    Banned {relativeTime(ban.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={unbanning[ban.user.handle]}
                  onClick={() => void handleUnban(ban.user.handle)}
                  className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--fg))] hover:bg-brand-500/10 hover:text-brand-500 hover:border-brand-500/30 transition-colors disabled:opacity-50"
                >
                  {unbanning[ban.user.handle] ? 'Unbanning…' : 'Unban'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
