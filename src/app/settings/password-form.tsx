'use client';

import { useState } from 'react';

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [errors, setErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmNew?: string;
    general?: string;
  }>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function validate() {
    const next: typeof errors = {};
    if (!currentPassword) next.currentPassword = 'Current password is required.';
    if (!newPassword) next.newPassword = 'New password is required.';
    else if (newPassword.length < 8)
      next.newPassword = 'Password must be at least 8 characters.';
    if (!confirmNew) next.confirmNew = 'Please confirm your new password.';
    else if (newPassword !== confirmNew)
      next.confirmNew = 'Passwords do not match.';
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      const res = await fetch('/api/user/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: { message: string; code?: string };
      };

      if (!res.ok) {
        if (data.error?.code === 'WRONG_PASSWORD') {
          setErrors({ currentPassword: 'Current password is incorrect.' });
        } else {
          setErrors({ general: data.error?.message ?? 'Failed to update password.' });
        }
        return;
      }

      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNew('');
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setErrors({ general: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="currentPassword"
          className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]"
        >
          Current password
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          aria-invalid={!!errors.currentPassword}
          aria-describedby={
            errors.currentPassword ? 'currentPassword-error' : undefined
          }
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="••••••••"
        />
        {errors.currentPassword && (
          <p
            id="currentPassword-error"
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {errors.currentPassword}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="newPassword"
          className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]"
        >
          New password
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          aria-invalid={!!errors.newPassword}
          aria-describedby={errors.newPassword ? 'newPassword-error' : undefined}
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Min. 8 characters"
        />
        {errors.newPassword && (
          <p
            id="newPassword-error"
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {errors.newPassword}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="confirmNew"
          className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]"
        >
          Confirm new password
        </label>
        <input
          id="confirmNew"
          type="password"
          autoComplete="new-password"
          value={confirmNew}
          onChange={(e) => setConfirmNew(e.target.value)}
          aria-invalid={!!errors.confirmNew}
          aria-describedby={errors.confirmNew ? 'confirmNew-error' : undefined}
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="••••••••"
        />
        {errors.confirmNew && (
          <p
            id="confirmNew-error"
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {errors.confirmNew}
          </p>
        )}
      </div>

      {errors.general && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errors.general}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-green-600 dark:text-green-400">
          Password updated successfully.
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {loading ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}
