import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ProfileForm } from './profile-form';
import { AvatarForm } from './avatar-form';
import { PasswordForm } from './password-form';

export const metadata: Metadata = {
  title: 'Account Settings',
};

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/settings');
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      displayName: true,
      bio: true,
      handle: true,
      avatar: true,
      email: true,
    },
  });

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">
          Account Settings
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Manage your PostUp profile and account security.
        </p>
      </div>

      {/* Profile section */}
      <section
        aria-labelledby="profile-heading"
        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6"
      >
        <h2
          id="profile-heading"
          className="mb-4 text-base font-semibold text-[rgb(var(--fg))]"
        >
          Profile
        </h2>
        <ProfileForm
          displayName={user.displayName}
          bio={user.bio}
          handle={user.handle}
        />
      </section>

      {/* Avatar section */}
      <section
        aria-labelledby="avatar-heading"
        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6"
      >
        <h2
          id="avatar-heading"
          className="mb-4 text-base font-semibold text-[rgb(var(--fg))]"
        >
          Avatar
        </h2>
        <AvatarForm
          avatarUrl={user.avatar ?? null}
          displayName={user.displayName}
        />
      </section>

      {/* Password section */}
      <section
        aria-labelledby="password-heading"
        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6"
      >
        <h2
          id="password-heading"
          className="mb-4 text-base font-semibold text-[rgb(var(--fg))]"
        >
          Password
        </h2>
        <PasswordForm />
      </section>

      {/* Danger zone */}
      <section
        aria-labelledby="danger-heading"
        className="rounded-xl border border-red-200 bg-[rgb(var(--card))] p-6 dark:border-red-900"
      >
        <h2
          id="danger-heading"
          className="mb-1 text-base font-semibold text-red-600 dark:text-red-400"
        >
          Danger zone
        </h2>
        <p className="mb-4 text-sm text-[rgb(var(--muted))]">
          Irreversible actions that affect your account.
        </p>
        <button
          type="button"
          disabled
          title="Coming soon"
          aria-disabled="true"
          className="cursor-not-allowed rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 opacity-50 dark:border-red-800 dark:text-red-400"
        >
          Delete account
        </button>
        <p className="mt-2 text-xs text-[rgb(var(--muted))]">Coming soon.</p>
      </section>
    </div>
  );
}
