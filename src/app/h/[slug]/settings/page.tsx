import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { IdentityForm } from './identity-form';
import { MediaForm } from './media-form';
import { WardenForm } from './warden-form';
import { DeleteHubButton } from './delete-hub-button';

interface Props {
  params: Promise<{ slug: string }>;
}

async function getHubWithWardens(slug: string) {
  return db.hub.findUnique({
    where: { slug },
    include: {
      creator: { select: { handle: true, id: true } },
      memberships: {
        where: { role: 'WARDEN' },
        include: {
          user: { select: { handle: true, avatar: true, clout: true } },
        },
        orderBy: { joinedAt: 'asc' },
      },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `h/${slug} Settings` };
}

export default async function HubSettingsPage({ params }: Props) {
  const { slug } = await params;

  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/h/${slug}/settings`);
  }

  const hub = await getHubWithWardens(slug);
  if (!hub) notFound();

  // Authorization: must be WARDEN of this hub or site OVERSEER
  const isOverseer = session.user.role === 'OVERSEER';
  let isWarden = isOverseer;

  if (!isOverseer) {
    const membership = await db.membership.findUnique({
      where: { userId_hubId: { userId: session.user.id, hubId: hub.id } },
      select: { role: true },
    });
    isWarden = membership?.role === 'WARDEN';
  }

  if (!isWarden) {
    redirect(`/h/${slug}`);
  }

  const wardens = hub.memberships.map((m) => ({
    id: m.id,
    role: m.role,
    user: m.user,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back link */}
      <div>
        <Link
          href={`/h/${hub.slug}`}
          className="text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] transition-colors"
        >
          &larr; Back to h/{hub.slug}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">
          h/{hub.slug} Settings
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted))]">
          Manage your community&apos;s appearance, rules, and moderation team.
        </p>
      </div>

      {/* Identity */}
      <section
        aria-labelledby="identity-heading"
        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6"
      >
        <h2
          id="identity-heading"
          className="mb-4 text-base font-semibold text-[rgb(var(--fg))]"
        >
          Identity
        </h2>
        <IdentityForm
          hubSlug={hub.slug}
          initialDescription={hub.description}
          initialRules={hub.rules}
          initialNsfw={hub.nsfw}
        />
      </section>

      {/* Icon */}
      <section
        aria-labelledby="icon-heading"
        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6"
      >
        <h2
          id="icon-heading"
          className="mb-4 text-base font-semibold text-[rgb(var(--fg))]"
        >
          Hub Icon
        </h2>
        <MediaForm
          hubSlug={hub.slug}
          type="icon"
          currentUrl={hub.icon ?? null}
          label="Icon"
        />
      </section>

      {/* Banner */}
      <section
        aria-labelledby="banner-heading"
        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6"
      >
        <h2
          id="banner-heading"
          className="mb-4 text-base font-semibold text-[rgb(var(--fg))]"
        >
          Hub Banner
        </h2>
        <p className="mb-3 text-sm text-[rgb(var(--muted))]">
          Displayed at the top of your hub page. Recommended size: 1200&times;200 px.
        </p>
        <MediaForm
          hubSlug={hub.slug}
          type="banner"
          currentUrl={hub.banner ?? null}
          label="Banner"
        />
      </section>

      {/* Warden management */}
      <section
        aria-labelledby="wardens-heading"
        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6"
      >
        <h2
          id="wardens-heading"
          className="mb-4 text-base font-semibold text-[rgb(var(--fg))]"
        >
          Wardens
        </h2>
        <WardenForm
          hubSlug={hub.slug}
          initialWardens={wardens}
          canDemote={isWarden}
          creatorHandle={hub.creator.handle}
        />
      </section>

      {/* Danger zone — OVERSEER only */}
      {isOverseer && (
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
            Permanently deletes h/{hub.slug} and all its content. This cannot be
            undone.
          </p>
          <DeleteHubButton hubSlug={hub.slug} />
        </section>
      )}
    </div>
  );
}
