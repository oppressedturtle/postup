'use client';

import { useState } from 'react';

interface Props {
  displayName: string;
  bio: string | null;
  handle: string;
}

export function ProfileForm({ displayName, bio, handle }: Props) {
  const [name, setName] = useState(displayName);
  const [bioValue, setBioValue] = useState(bio ?? '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!name.trim()) {
      setError('Display name cannot be empty.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: name.trim(),
          bio: bioValue.trim() || null,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: { message: string };
      };

      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to update profile.');
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="displayName"
          className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]"
        >
          Display name
        </label>
        <input
          id="displayName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Your display name"
        />
      </div>

      <div>
        <label
          htmlFor="handle-ref"
          className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]"
        >
          Handle
        </label>
        <input
          id="handle-ref"
          type="text"
          value={`u/${handle}`}
          readOnly
          disabled
          className="w-full cursor-not-allowed rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--muted))] opacity-70"
          aria-label="Handle (read-only)"
        />
        <p className="mt-1 text-xs text-[rgb(var(--muted))]">
          Handles cannot be changed after registration.
        </p>
      </div>

      <div>
        <label
          htmlFor="bio"
          className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]"
        >
          Bio
        </label>
        <textarea
          id="bio"
          value={bioValue}
          onChange={(e) => setBioValue(e.target.value)}
          maxLength={300}
          rows={3}
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          placeholder="Tell the community about yourself…"
        />
        <p className="mt-1 text-right text-xs text-[rgb(var(--muted))]">
          {bioValue.length}/300
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-green-600 dark:text-green-400">
          Profile updated.
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
