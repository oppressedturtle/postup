'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminUser {
  id: string;
  handle: string;
  email: string;
  displayName: string;
  avatar: string | null;
  role: 'MEMBER' | 'OVERSEER';
  clout: number;
  suspended: boolean;
  createdAt: string;
}

interface ConfirmDialog {
  title: string;
  message: string;
  onConfirm: () => void;
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
// Confirmation dialog
// ---------------------------------------------------------------------------

function ConfirmDialogModal({
  dialog,
  onCancel,
}: {
  dialog: ConfirmDialog;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-xl"
      >
        <h2 id="confirm-title" className="text-base font-semibold text-[rgb(var(--fg))]">
          {dialog.title}
        </h2>
        <p className="mt-2 text-sm text-[rgb(var(--muted))]">{dialog.message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm text-[rgb(var(--fg))] hover:bg-[rgb(var(--border))] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              dialog.onConfirm();
              onCancel();
            }}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// AdminUsersPage
// ---------------------------------------------------------------------------

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<ConfirmDialog | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load users');
      const data = (await res.json()) as { users: AdminUser[] };
      setUsers(data.users);
    } catch {
      setError('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers('');
  }, [fetchUsers]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchUsers(q), 300);
  }

  async function patchUser(handle: string, patch: { role?: 'MEMBER' | 'OVERSEER'; suspended?: boolean }) {
    setActing((prev) => ({ ...prev, [handle]: true }));
    try {
      const res = await fetch(`/api/admin/users/${handle}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = (await res.json()) as { user: AdminUser };
        setUsers((prev) => prev.map((u) => (u.handle === handle ? { ...u, ...data.user } : u)));
      }
    } catch {
      // silent
    } finally {
      setActing((prev) => ({ ...prev, [handle]: false }));
    }
  }

  function confirmAction(dialog: ConfirmDialog) {
    setConfirm(dialog);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">Users</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Search and manage user accounts.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={handleSearchChange}
          placeholder="Search by handle or email…"
          aria-label="Search users"
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] py-2 pl-9 pr-4 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-[rgb(var(--border))]" aria-hidden="true" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 text-center">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-8 text-center">
          <p className="text-sm text-[rgb(var(--muted))]">No users found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))] text-xs text-[rgb(var(--muted))]">
                <th className="px-4 py-3 text-left font-medium">User</th>
                <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Clout</th>
                <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Joined</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {users.map((user) => {
                const isActing = acting[user.handle] ?? false;
                return (
                  <tr key={user.id} className="hover:bg-[rgb(var(--border))]/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar src={user.avatar} handle={user.handle} />
                        <div>
                          <p className="font-medium text-[rgb(var(--fg))]">u/{user.handle}</p>
                          <p className="text-xs text-[rgb(var(--muted))]">{user.displayName}</p>
                          {user.suspended && (
                            <span className="inline-block rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-950 dark:text-red-400">
                              Suspended
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="text-[rgb(var(--muted))]">{user.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          user.role === 'OVERSEER'
                            ? 'bg-brand-500/10 text-brand-500'
                            : 'bg-[rgb(var(--border))] text-[rgb(var(--muted))]',
                        ].join(' ')}
                      >
                        {user.role === 'OVERSEER' ? 'Overseer' : 'Member'}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span className="text-[rgb(var(--muted))]">{user.clout.toLocaleString()}</span>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <span className="text-[rgb(var(--muted))]">{relativeDate(user.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Role toggle */}
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() =>
                            confirmAction({
                              title: user.role === 'OVERSEER' ? 'Remove Overseer' : 'Make Overseer',
                              message: `Are you sure you want to ${user.role === 'OVERSEER' ? 'remove Overseer from' : 'make'} u/${user.handle} ${user.role === 'OVERSEER' ? '' : 'an Overseer'}?`,
                              onConfirm: () =>
                                void patchUser(user.handle, {
                                  role: user.role === 'OVERSEER' ? 'MEMBER' : 'OVERSEER',
                                }),
                            })
                          }
                          className="rounded-md border border-[rgb(var(--border))] px-2 py-1 text-xs text-[rgb(var(--fg))] hover:border-brand-500/50 hover:text-brand-500 transition-colors disabled:opacity-50"
                        >
                          {user.role === 'OVERSEER' ? 'Remove Overseer' : 'Make Overseer'}
                        </button>

                        {/* Suspend toggle */}
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() =>
                            confirmAction({
                              title: user.suspended ? 'Unsuspend User' : 'Suspend User',
                              message: `Are you sure you want to ${user.suspended ? 'unsuspend' : 'suspend'} u/${user.handle}?`,
                              onConfirm: () =>
                                void patchUser(user.handle, { suspended: !user.suspended }),
                            })
                          }
                          className={[
                            'rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50',
                            user.suspended
                              ? 'border-green-300 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950'
                              : 'border-red-300 text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30',
                          ].join(' ')}
                        >
                          {user.suspended ? 'Unsuspend' : 'Suspend'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialogModal dialog={confirm} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
