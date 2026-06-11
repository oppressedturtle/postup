import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { auth } from '@/lib/auth';
import { CreateHubForm } from './create-hub-form';

export const metadata: Metadata = {
  title: 'Create a Hub',
  description: 'Start your own community on PostUp.',
};

export default async function CreateHubPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/h/create');
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">Create a Hub</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Start your own community. You&apos;ll be its first Warden.
        </p>
      </div>

      <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
        <CreateHubForm />
      </section>
    </div>
  );
}
