import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreateDropForm } from './create-drop-form';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Create a Drop in h/${slug}` };
}

export default async function SubmitDropPage({ params }: Props) {
  const { slug } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  const hub = await db.hub.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });

  if (!hub) {
    redirect(`/h/${slug}`);
  }

  const membership = await db.membership.findUnique({
    where: { userId_hubId: { userId: session.user.id, hubId: hub.id } },
    select: { id: true },
  });

  if (!membership) {
    redirect(`/h/${slug}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[rgb(var(--fg))]">
          Create a Drop in{' '}
          <span className="text-brand-500">h/{hub.slug}</span>
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Share something with the community.
        </p>
      </div>

      <CreateDropForm hubSlug={hub.slug} />
    </div>
  );
}
