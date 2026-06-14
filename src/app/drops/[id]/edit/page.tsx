import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { EditDropForm } from './edit-drop-form';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const drop = await db.drop.findUnique({ where: { id }, select: { title: true } });
  return { title: drop ? `Edit: ${drop.title}` : 'Edit Drop' };
}

export default async function EditDropPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  const drop = await db.drop.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      body: true,
      type: true,
      isRemoved: true,
      authorId: true,
      hub: { select: { slug: true } },
    },
  });

  if (!drop || drop.isRemoved) {
    redirect('/');
  }

  // Only the author can edit
  if (drop.authorId !== session.user.id) {
    redirect(`/drops/${id}`);
  }

  // Only TEXT drops can be edited
  if (drop.type !== 'TEXT') {
    redirect(`/drops/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[rgb(var(--fg))]">Edit Drop</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Only the title and body can be edited.
        </p>
      </div>

      <EditDropForm
        dropId={drop.id}
        initialTitle={drop.title}
        initialBody={drop.body ?? ''}
      />
    </div>
  );
}
