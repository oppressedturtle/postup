'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';

interface FieldErrors {
  email?: string;
  handle?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!email) next.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = 'Enter a valid email address.';

    if (!handle) next.handle = 'Handle is required.';
    else if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle))
      next.handle =
        'Handle must be 3–20 characters: letters, numbers, underscores only.';

    if (!password) next.password = 'Password is required.';
    else if (password.length < 8)
      next.password = 'Password must be at least 8 characters.';

    if (!confirmPassword) next.confirmPassword = 'Please confirm your password.';
    else if (password !== confirmPassword)
      next.confirmPassword = 'Passwords do not match.';

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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, handle, password }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: {
          code: string;
          message: string;
          details?: Record<string, string[]>;
        };
      };

      if (!res.ok) {
        if (res.status === 429) {
          setErrors({ general: 'Too many attempts. Please try again later.' });
          return;
        }
        if (data.error?.code === 'EMAIL_TAKEN') {
          setErrors({ email: 'An account with that email already exists.' });
          return;
        }
        if (data.error?.code === 'HANDLE_TAKEN') {
          setErrors({ handle: 'That handle is already taken.' });
          return;
        }
        if (data.error?.code === 'VALIDATION_ERROR' && data.error.details) {
          const details = data.error.details;
          setErrors({
            email: details.email?.[0],
            handle: details.handle?.[0],
            password: details.password?.[0],
          });
          return;
        }
        setErrors({ general: data.error?.message ?? 'Registration failed.' });
        return;
      }

      // Auto-login after successful registration
      await signIn('credentials', { email, password, redirectTo: '/' });
    } catch {
      setErrors({ general: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
      <h1 className="mb-1 text-xl font-bold text-[rgb(var(--fg))]">
        Create your account
      </h1>
      <p className="mb-6 text-sm text-[rgb(var(--muted))]">
        Join PostUp and start sharing Drops.
      </p>

      {errors.general && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
        >
          {errors.general}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="you@example.com"
          />
          {errors.email && (
            <p id="email-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="handle"
            className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]"
          >
            Handle
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[rgb(var(--muted))]">
              u/
            </span>
            <input
              id="handle"
              type="text"
              autoComplete="username"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              aria-invalid={!!errors.handle}
              aria-describedby={errors.handle ? 'handle-error' : 'handle-hint'}
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] py-2 pl-8 pr-3 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="yourhandle"
            />
          </div>
          {errors.handle ? (
            <p id="handle-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {errors.handle}
            </p>
          ) : (
            <p id="handle-hint" className="mt-1 text-xs text-[rgb(var(--muted))]">
              3–20 characters: letters, numbers, underscores.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Min. 8 characters"
          />
          {errors.password && (
            <p id="password-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {errors.password}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]"
          >
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={
              errors.confirmPassword ? 'confirmPassword-error' : undefined
            }
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="••••••••"
          />
          {errors.confirmPassword && (
            <p
              id="confirmPassword-error"
              className="mt-1 text-xs text-red-600 dark:text-red-400"
            >
              {errors.confirmPassword}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[rgb(var(--muted))]">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-500 hover:text-brand-600">
          Sign in
        </Link>
      </p>
    </div>
  );
}
