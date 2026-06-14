import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { renderMarkdown } from '@/lib/markdown';
import { fetchOEmbed } from '@/lib/oembed';
import { HubIcon } from '@/components/hubs/hub-card';
import { DeleteDropButton } from '@/components/drops/delete-drop-button';
import { VoteButtons } from '@/components/drops/vote-buttons';
import type { LinkPreviewData } from '@/types/drop';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function getDrop(id: string) {
  return db.drop.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, handle: true, displayName: true, avatar: true } },
      hub: { select: { id: true, slug: true, name: true, icon: true } },
      _count: { select: { replies: true, votes: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const drop = await getDrop(id);
  if (!drop || drop.isRemoved) return { title: 'Drop not found' };

  const description =
    drop.body
      ? drop.body.slice(0, 150)
      : (drop.linkPreview as LinkPreviewData | null)?.description ?? undefined;

  return {
    title: drop.title,
    description,
    openGraph: {
      title: drop.title,
      description: description ?? undefined,
      images: drop.imageUrl ? [drop.imageUrl] : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Link preview card (full)
// ---------------------------------------------------------------------------

function DetailLinkPreviewCard({ preview, url }: { preview: LinkPreviewData; url: string }) {
  const domain = preview.domain ?? (() => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  })();

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-[rgb(var(--border))]">
      {preview.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.imageUrl} alt="" className="w-full max-h-64 object-cover" loading="lazy" />
      )}
      <div className="p-4">
        <p className="text-xs text-[rgb(var(--muted))]">{domain}</p>
        {preview.title && (
          <p className="mt-1 text-base font-semibold text-[rgb(var(--fg))]">{preview.title}</p>
        )}
        {preview.description && (
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">{preview.description}</p>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
        >
          Visit Link
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DropDetailPage({ params }: Props) {
  const { id } = await params;
  const [drop, session] = await Promise.all([getDrop(id), auth()]);

  if (!drop || drop.isRemoved) notFound();

  const userId = session?.user?.id ?? null;
  const isAuthor = userId === drop.authorId;
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const canDelete = isAuthor || userRole === 'OVERSEER';

  // Check warden status if user is authenticated and not author/overseer
  let isWarden = false;
  if (userId && !isAuthor && userRole !== 'OVERSEER') {
    const membership = await db.membership.findUnique({
      where: { userId_hubId: { userId, hubId: drop.hubId } },
      select: { role: true },
    });
    isWarden = membership?.role === 'WARDEN';
  }
  const canDeleteFinal = canDelete || isWarden;

  // Render TEXT body
  let renderedBody: string | null = null;
  if (drop.type === 'TEXT' && drop.body) {
    renderedBody = await renderMarkdown(drop.body);
  }

  // Fetch oEmbed for LINK drops (YouTube, Vimeo, Twitter)
  let oEmbed: { html: string; width: number; height: number } | null = null;
  if (drop.type === 'LINK' && drop.linkUrl) {
    oEmbed = await fetchOEmbed(drop.linkUrl);
  }

  const hubInitial = (drop.hub.name[0] ?? 'H').toUpperCase();
  const linkPreview = drop.linkPreview as LinkPreviewData | null;

  const relativeTime = (() => {
    const diff = Date.now() - drop.createdAt.getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  })();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
        <Link href={`/h/${drop.hub.slug}`} className="flex items-center gap-1 hover:text-brand-500 transition-colors">
          <HubIcon src={drop.hub.icon} initial={hubInitial} size={16} />
          h/{drop.hub.slug}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate text-[rgb(var(--fg))]">{drop.title}</span>
      </nav>

      {/* Main card */}
      <article className="flex gap-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
        {/* Vote column */}
        <VoteButtons
          dropId={drop.id}
          initialHeat={drop.heat}
          initialUserVote={null}
          orientation="vertical"
        />

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-1 text-xs text-[rgb(var(--muted))]">
            <Link href={`/h/${drop.hub.slug}`} className="font-medium text-[rgb(var(--fg))] hover:text-brand-500 transition-colors">
              h/{drop.hub.slug}
            </Link>
            <span aria-hidden="true">·</span>
            <span>
              Posted by{' '}
              <Link href={`/u/${drop.author.handle}`} className="hover:text-brand-500 transition-colors">
                u/{drop.author.handle}
              </Link>
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime={drop.createdAt.toISOString()}>{relativeTime}</time>
            {drop.isPinned && <><span aria-hidden="true">·</span><span className="font-medium text-brand-500">Pinned</span></>}
            {drop.isLocked && <><span aria-hidden="true">·</span><span className="font-medium text-[rgb(var(--muted))]">Locked</span></>}
          </div>

          {/* Title */}
          <h1 className="mt-2 text-xl font-bold text-[rgb(var(--fg))]">{drop.title}</h1>

          {/* Content by type */}
          <div className="mt-4">
            {drop.type === 'TEXT' && renderedBody && (
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-[rgb(var(--fg))]"
                dangerouslySetInnerHTML={{ __html: renderedBody }}
              />
            )}

            {drop.type === 'IMAGE' && drop.imageUrl && (
              <Image
                src={drop.imageUrl}
                alt={drop.title}
                width={800}
                height={600}
                className="rounded-xl object-contain"
                unoptimized
              />
            )}

            {drop.type === 'VIDEO' && drop.videoUrl && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                controls
                className="w-full rounded-xl"
                aria-label={`Video: ${drop.title}`}
              >
                <source src={drop.videoUrl} />
                Your browser does not support the video element.
              </video>
            )}

            {drop.type === 'LINK' && drop.linkUrl && (
              <>
                {oEmbed ? (
                  <div
                    className="overflow-hidden rounded-xl"
                    dangerouslySetInnerHTML={{ __html: oEmbed.html }}
                    style={{ aspectRatio: `${oEmbed.width} / ${oEmbed.height}` }}
                  />
                ) : linkPreview ? (
                  <DetailLinkPreviewCard preview={linkPreview} url={drop.linkUrl} />
                ) : (
                  <a
                    href={drop.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand-500 hover:underline break-all"
                  >
                    {drop.linkUrl}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[rgb(var(--border))] pt-4">
            <div className="flex items-center gap-1.5 text-sm text-[rgb(var(--muted))]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>{drop._count.replies} {drop._count.replies === 1 ? 'reply' : 'replies'}</span>
            </div>

            {isAuthor && drop.type === 'TEXT' && (
              <Link
                href={`/drops/${drop.id}/edit`}
                className="rounded-md px-3 py-1 text-sm text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))] transition-colors"
              >
                Edit
              </Link>
            )}

            {canDeleteFinal && (
              <DeleteDropButton dropId={drop.id} hubSlug={drop.hub.slug} />
            )}
          </div>
        </div>
      </article>

      {/* Replies — Phase 5 placeholder */}
      <section id="replies" aria-labelledby="replies-heading">
        <h2 id="replies-heading" className="mb-3 text-base font-semibold text-[rgb(var(--fg))]">
          Replies
        </h2>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] py-12 text-center">
          <span aria-hidden="true" className="text-3xl">💬</span>
          <p className="font-medium text-[rgb(var(--fg))]">Replies coming in Phase 5</p>
          <p className="text-sm text-[rgb(var(--muted))]">
            Threaded comments, Heat-ranked replies, and reply voting are on the roadmap.
          </p>
        </div>
      </section>
    </div>
  );
}
