'use client';

import { useState, useId } from 'react';

interface Props {
  hubSlug: string;
  initialDescription: string;
  initialRules: string;
  initialNsfw: boolean;
}

export function IdentityForm({
  hubSlug,
  initialDescription,
  initialRules,
  initialNsfw,
}: Props) {
  const descriptionId = useId();
  const rulesId = useId();
  const nsfwId = useId();

  const [description, setDescription] = useState(initialDescription);
  const [rules, setRules] = useState(initialRules);
  const [nsfw, setNsfw] = useState(initialNsfw);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/hubs/${hubSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, rules, nsfw }),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const data = (await res.json()) as { error?: { message: string } };
        setError(data.error?.message ?? 'Save failed. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {/* Description */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label
            htmlFor={descriptionId}
            className="block text-sm font-medium text-[rgb(var(--fg))]"
          >
            Description
          </label>
          <span
            aria-live="polite"
            className={`text-xs ${description.length > 500 ? 'text-red-500' : 'text-[rgb(var(--muted))]'}`}
          >
            {description.length}/500
          </span>
        </div>
        <textarea
          id={descriptionId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
          className="w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
      </div>

      {/* Rules */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label
            htmlFor={rulesId}
            className="block text-sm font-medium text-[rgb(var(--fg))]"
          >
            Rules
          </label>
          <span
            aria-live="polite"
            className={`text-xs ${rules.length > 2000 ? 'text-red-500' : 'text-[rgb(var(--muted))]'}`}
          >
            {rules.length}/2000
          </span>
        </div>
        <textarea
          id={rulesId}
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          rows={5}
          maxLength={2000}
          className="w-full resize-y rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
      </div>

      {/* NSFW toggle */}
      <div className="flex items-center gap-3">
        <button
          id={nsfwId}
          type="button"
          role="switch"
          aria-checked={nsfw}
          onClick={() => setNsfw((v) => !v)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
            nsfw ? 'bg-brand-500' : 'bg-[rgb(var(--border))]'
          }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-4 w-4 translate-y-0 rounded-full bg-white shadow ring-0 transition-transform ${
              nsfw ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
        <label
          htmlFor={nsfwId}
          className="cursor-pointer text-sm text-[rgb(var(--fg))]"
        >
          NSFW community
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {success && (
          <p role="status" className="text-sm text-green-600 dark:text-green-400">
            Saved.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
