'use client';

import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';

const SLUG_REGEX = /^[a-z0-9_]{1,30}$/;

export function CreateHubForm() {
  const router = useRouter();
  const nameId = useId();
  const descriptionId = useId();
  const rulesId = useId();
  const nsfwId = useId();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [nsfw, setNsfw] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const slugValid = SLUG_REGEX.test(name);
  const slugInvalid = name.length > 0 && !slugValid;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setGlobalError(null);

    const fieldErrors: Record<string, string> = {};

    if (!name) {
      fieldErrors.name = 'Hub name is required.';
    } else if (!slugValid) {
      fieldErrors.name =
        'Hub name must be 1–30 characters: lowercase letters, numbers, and underscores only.';
    }
    if (!description.trim()) {
      fieldErrors.description = 'Description is required.';
    } else if (description.length > 500) {
      fieldErrors.description = 'Description must be 500 characters or fewer.';
    }
    if (rules.length > 2000) {
      fieldErrors.rules = 'Rules must be 2000 characters or fewer.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/hubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, rules: rules || undefined, nsfw }),
      });

      if (res.status === 201) {
        router.push(`/h/${name}`);
        return;
      }

      const data = (await res.json()) as {
        error?: { code?: string; message: string; details?: Record<string, string[]> };
      };

      if (res.status === 409) {
        setErrors({ name: "That hub name is taken. Please choose a different name." });
        return;
      }

      if (res.status === 429) {
        setGlobalError(
          "You've created too many hubs today. You can create at most 3 hubs per day. Please try again later."
        );
        return;
      }

      if (res.status === 422 && data.error?.details) {
        const mapped: Record<string, string> = {};
        for (const [field, msgs] of Object.entries(data.error.details)) {
          mapped[field] = (msgs as string[])[0] ?? 'Invalid value.';
        }
        setErrors(mapped);
        return;
      }

      setGlobalError(data.error?.message ?? 'Something went wrong. Please try again.');
    } catch {
      setGlobalError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-5">
      {globalError && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {globalError}
        </div>
      )}

      {/* Hub name */}
      <div className="space-y-1">
        <label
          htmlFor={nameId}
          className="block text-sm font-medium text-[rgb(var(--fg))]"
        >
          Hub name <span aria-hidden="true" className="text-red-500">*</span>
        </label>
        <p className="text-xs text-[rgb(var(--muted))]">
          Lowercase letters, numbers, and underscores only (max 30 characters).
          This cannot be changed later.
        </p>
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[rgb(var(--muted))]"
          >
            h/
          </span>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? `${nameId}-error` : `${nameId}-preview`}
            maxLength={30}
            className={`w-full rounded-lg border bg-[rgb(var(--card))] py-2 pl-8 pr-3 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              errors.name
                ? 'border-red-400 dark:border-red-600'
                : 'border-[rgb(var(--border))]'
            }`}
            placeholder="my_hub_name"
          />
        </div>
        {/* Live preview */}
        {name && !errors.name && (
          <p id={`${nameId}-preview`} className="text-xs text-[rgb(var(--muted))]">
            Preview:{' '}
            <span
              className={slugValid ? 'font-medium text-brand-500' : 'text-red-500'}
            >
              h/{name}
            </span>
            {slugInvalid && ' — invalid characters'}
          </p>
        )}
        {errors.name && (
          <p id={`${nameId}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400">
            {errors.name}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label
            htmlFor={descriptionId}
            className="block text-sm font-medium text-[rgb(var(--fg))]"
          >
            Description <span aria-hidden="true" className="text-red-500">*</span>
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
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
          className={`w-full resize-none rounded-lg border bg-[rgb(var(--card))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
            errors.description
              ? 'border-red-400 dark:border-red-600'
              : 'border-[rgb(var(--border))]'
          }`}
          placeholder="What is your hub about?"
        />
        {errors.description && (
          <p id={`${descriptionId}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400">
            {errors.description}
          </p>
        )}
      </div>

      {/* Rules (optional) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label
            htmlFor={rulesId}
            className="block text-sm font-medium text-[rgb(var(--fg))]"
          >
            Rules{' '}
            <span className="text-xs font-normal text-[rgb(var(--muted))]">
              (optional)
            </span>
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
          rows={4}
          maxLength={2000}
          aria-invalid={!!errors.rules}
          aria-describedby={errors.rules ? `${rulesId}-error` : undefined}
          className={`w-full resize-y rounded-lg border bg-[rgb(var(--card))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
            errors.rules
              ? 'border-red-400 dark:border-red-600'
              : 'border-[rgb(var(--border))]'
          }`}
          placeholder="1. Be respectful.&#10;2. No spam.&#10;…"
        />
        {errors.rules && (
          <p id={`${rulesId}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400">
            {errors.rules}
          </p>
        )}
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
          Mark as NSFW
          <span className="ml-1.5 text-xs text-[rgb(var(--muted))]">
            (18+ content — shows a warning to visitors)
          </span>
        </label>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {submitting ? 'Creating…' : 'Create Hub'}
        </button>
      </div>
    </form>
  );
}
