'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

import type { Drop, LinkPreviewData } from '@/types/drop';
import { HubIcon } from '@/components/hubs/hub-card';
import { VoteButtons } from './vote-buttons';
import { ReportButton } from '@/components/moderation/report-button';
import { DropModMenu } from '@/components/moderation/drop-mod-menu';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}


// ---------------------------------------------------------------------------
// Content preview renderers
// ---------------------------------------------------------------------------

function TextPreview({ body }: { body: string | null }) {
  if (!body) return null;
  const truncated = body.length > 300;
  const preview = truncated ? body.slice(0, 300) : body;
  return (
    <p className="mt-2 text-sm text-[rgb(var(--fg))] leading-relaxed">
      {preview}
      {truncated && (
        <span className="text-brand-500 ml-1">…Read more</span>
      )}
    </p>
  );
}

function ImagePreview({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mt-2">
      {/* External MinIO URLs need unoptimized */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-w-[512px] rounded-lg object-cover"
        style={{ maxWidth: '100%' }}
        loading="lazy"
      />
    </div>
  );
}

function VideoPreview() {
  return (
    <div className="mt-2 flex h-32 max-w-[512px] items-center justify-center rounded-lg bg-[rgb(var(--border))]">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/80 shadow">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="ml-1 text-brand-500">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  );
}

function LinkPreviewCard({ preview, url }: { preview: LinkPreviewData; url: string }) {
  const displayDomain = preview.domain ?? getDomain(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex overflow-hidden rounded-lg border border-[rgb(var(--border))] hover:border-brand-500/50 transition-colors"
      aria-label={`Visit: ${preview.title ?? url}`}
    >
      {preview.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.imageUrl}
          alt=""
          className="h-24 w-32 shrink-0 object-cover"
          loading="lazy"
        />
      )}
      <div className="flex flex-col justify-center gap-1 px-3 py-2 min-w-0">
        <p className="text-xs text-[rgb(var(--muted))]">{displayDomain}</p>
        {preview.title && (
          <p className="text-sm font-medium text-[rgb(var(--fg))] line-clamp-2">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-xs text-[rgb(var(--muted))] line-clamp-2">
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// NSFW overlay
// ---------------------------------------------------------------------------

function NsfwOverlay({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) return <>{children}</>;

  return (
    <div className="relative mt-2">
      <div className="pointer-events-none select-none blur-md">{children}</div>
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 text-sm font-medium text-white backdrop-blur-sm"
      >
        NSFW — click to reveal
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DropCard
// ---------------------------------------------------------------------------

export interface DropCardProps {
  drop: Drop;
  /** Whether the currently-authenticated user authored this drop */
  isAuthor?: boolean;
  /** Called after a successful delete so the parent feed can remove the card */
  onDeleted?: (id: string) => void;
  nsfw?: boolean;
  /** Pre-hydrated vote state from the bulk hook; if omitted VoteButtons self-fetches */
  voteState?: { userVote: 1 | -1 | null; heat: number };
  /** Site-wide role of the current user */
  userRole?: string;
  /** Hub-level role of the current user (WARDEN if they moderate this hub) */
  userHubRole?: string;
}

export function DropCard({ drop, isAuthor = false, onDeleted, nsfw = false, voteState, userRole, userHubRole }: DropCardProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const effectiveUserRole = userRole ?? (session?.user as { role?: string } | undefined)?.role;

  const hubInitial = (drop.hub.name[0] ?? 'H').toUpperCase();
  const dropUrl = `/drops/${drop.id}`;

  async function handleDelete() {
    if (!confirm('Remove this drop?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/drops/${drop.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDeleted?.(drop.id);
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleShare() {
    const url = `${window.location.origin}${dropUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  }

  // Render the content section
  let contentNode: React.ReactNode = null;
  if (drop.type === 'TEXT') {
    contentNode = <TextPreview body={drop.body} />;
  } else if (drop.type === 'IMAGE' && drop.imageUrl) {
    contentNode = <ImagePreview src={drop.imageUrl} alt={drop.title} />;
  } else if (drop.type === 'VIDEO') {
    contentNode = <VideoPreview />;
  } else if (drop.type === 'LINK' && drop.linkUrl) {
    const preview = drop.linkPreview;
    if (preview) {
      contentNode = <LinkPreviewCard preview={preview} url={drop.linkUrl} />;
    } else {
      contentNode = (
        <a
          href={drop.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-sm text-brand-500 hover:underline break-all"
        >
          {drop.linkUrl}
        </a>
      );
    }
  }

  const wrappedContent = nsfw && contentNode ? (
    <NsfwOverlay>{contentNode}</NsfwOverlay>
  ) : contentNode;

  const canDelete = isAuthor || effectiveUserRole === 'OVERSEER';

  return (
    <article className="flex gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4">
      {/* Vote column */}
      <VoteButtons
        resourceId={drop.id}
        initialHeat={voteState?.heat ?? drop.heat}
        initialUserVote={voteState?.userVote ?? null}
        orientation="vertical"
      />

      {/* Main */}
      <div className="min-w-0 flex-1">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-1 text-xs text-[rgb(var(--muted))]">
          <Link
            href={`/h/${drop.hub.slug}`}
            className="flex items-center gap-1 font-medium text-[rgb(var(--fg))] hover:text-brand-500 transition-colors"
          >
            <HubIcon src={drop.hub.icon} initial={hubInitial} size={16} />
            h/{drop.hub.slug}
          </Link>
          <span aria-hidden="true">·</span>
          <span>
            Posted by{' '}
            <Link
              href={`/u/${drop.author.handle}`}
              className="hover:text-brand-500 transition-colors"
            >
              u/{drop.author.handle}
            </Link>
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={drop.createdAt}>{relativeTime(drop.createdAt)}</time>
          {drop.isPinned && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-brand-500">Pinned</span>
            </>
          )}
          {drop.isLocked && (
            <>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-0.5 font-medium text-[rgb(var(--muted))]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Locked
              </span>
            </>
          )}
        </div>

        {/* Title */}
        <h2 className="mt-1">
          <Link
            href={dropUrl}
            className="font-semibold text-[rgb(var(--fg))] hover:text-brand-500 transition-colors"
          >
            {drop.title}
          </Link>
        </h2>

        {/* Content */}
        {wrappedContent}

        {/* Footer */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={`${dropUrl}#replies`}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {drop._count.replies} {drop._count.replies === 1 ? 'reply' : 'replies'}
          </Link>

          <button
            type="button"
            onClick={() => void handleShare()}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            {copied ? 'Copied!' : 'Share'}
          </button>

          {isAuthor && drop.type === 'TEXT' && (
            <Link
              href={`/drops/${drop.id}/edit`}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))] transition-colors"
            >
              Edit
            </Link>
          )}

          <ReportButton dropId={drop.id} />

          <DropModMenu
            drop={drop}
            userRole={effectiveUserRole}
            userHubRole={userHubRole}
          />

          {canDelete && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Removing…' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
