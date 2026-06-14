'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSession } from 'next-auth/react';

import type { Reply } from '@/types/reply';
import { VoteButtons } from '@/components/drops/vote-buttons';
import { ReplyForm } from './reply-form';
import { ReportButton } from '@/components/moderation/report-button';
import { ReplyModMenu } from '@/components/moderation/reply-mod-menu';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DEPTH = 6;

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

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function ReplyAvatar({ src, handle, size }: { src: string | null; handle: string; size: number }) {
  const initials = handle.slice(0, 2).toUpperCase();
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-500 font-semibold text-white"
    >
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Clout badge
// ---------------------------------------------------------------------------

function CloutBadge({ clout }: { clout: number }) {
  if (clout < 10) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-500">
      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
      {clout >= 1_000 ? `${(clout / 1_000).toFixed(1).replace(/\.0$/, '')}k` : clout}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Markdown renderer for reply body
// ---------------------------------------------------------------------------

function ReplyBody({ body }: { body: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children, ...props }) => {
          // Style @mention links
          const isMention = href?.startsWith('/u/');
          return (
            <a
              href={href}
              className={isMention ? 'mention' : 'text-brand-500 hover:underline break-words'}
              target={isMention ? undefined : '_blank'}
              rel={isMention ? undefined : 'noopener noreferrer'}
              {...props}
            >
              {children}
            </a>
          );
        },
        p: ({ children, ...props }) => (
          <p className="mb-2 last:mb-0 leading-relaxed" {...props}>{children}</p>
        ),
        code: ({ children, ...props }) => (
          <code className="rounded bg-[rgb(var(--border))] px-1 py-0.5 text-xs font-mono" {...props}>
            {children}
          </code>
        ),
        pre: ({ children, ...props }) => (
          <pre className="overflow-x-auto rounded-lg bg-[rgb(var(--border))] p-3 text-xs font-mono my-2" {...props}>
            {children}
          </pre>
        ),
        blockquote: ({ children, ...props }) => (
          <blockquote className="border-l-2 border-brand-500/50 pl-3 italic text-[rgb(var(--muted))] my-2" {...props}>
            {children}
          </blockquote>
        ),
        ul: ({ children, ...props }) => (
          <ul className="list-disc list-inside space-y-0.5 my-2" {...props}>{children}</ul>
        ),
        ol: ({ children, ...props }) => (
          <ol className="list-decimal list-inside space-y-0.5 my-2" {...props}>{children}</ol>
        ),
      }}
    >
      {body}
    </ReactMarkdown>
  );
}

// ---------------------------------------------------------------------------
// ReplyCard Props
// ---------------------------------------------------------------------------

export interface ReplyCardProps {
  reply: Reply;
  dropId: string;
  depth: number;
  /** Called when a new reply is successfully submitted within this subtree */
  onReplyAdded?: (reply: Reply) => void;
  /** Whether the parent drop is locked (disables new replies) */
  isLocked?: boolean;
  /** Hub-level role of the current user */
  userHubRole?: string;
}

// ---------------------------------------------------------------------------
// ReplyCard
// ---------------------------------------------------------------------------

export function ReplyCard({ reply, dropId, depth, onReplyAdded, isLocked = false, userHubRole }: ReplyCardProps) {
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [localChildren, setLocalChildren] = useState<Reply[]>(reply.children ?? []);
  const [deleting, setDeleting] = useState(false);
  const [isRemoved, setIsRemoved] = useState(reply.isRemoved);

  const userId = session?.user?.id ?? null;
  const userHandle = (session?.user as { handle?: string } | undefined)?.handle ?? null;
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const isAuthor = !!userId && userHandle === reply.author.handle;
  const isModerator = userRole === 'OVERSEER';
  const isModeratorOrWarden = isModerator || userHubRole === 'WARDEN';

  const totalDescendants = countDescendants(reply);

  // Collapsed view
  if (collapsed) {
    return (
      <div style={{ marginLeft: depth > 0 ? `${Math.min(depth, MAX_DEPTH) * 16}px` : 0 }}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))] hover:text-[rgb(var(--fg))] transition-colors"
          aria-label={`Expand reply thread from u/${reply.author.handle}`}
        >
          <span aria-hidden="true" className="text-xs">▶</span>
          <span className="font-medium text-[rgb(var(--fg))]">u/{reply.author.handle}</span>
          {totalDescendants > 0 && (
            <span className="text-xs">
              ({totalDescendants} {totalDescendants === 1 ? 'reply' : 'replies'})
            </span>
          )}
        </button>
      </div>
    );
  }

  // Continue thread link at max depth
  const showContinueThread = depth >= MAX_DEPTH && localChildren.length > 0;

  async function handleDelete() {
    if (!confirm('Remove this reply?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/replies/${reply.id}`, { method: 'DELETE' });
      if (res.ok) {
        setIsRemoved(true);
      }
    } finally {
      setDeleting(false);
    }
  }

  function handleReplySuccess(newReply: Reply) {
    setLocalChildren((prev) => [newReply, ...prev]);
    setShowReplyForm(false);
    onReplyAdded?.(newReply);
  }

  return (
    <div style={{ marginLeft: depth > 0 ? `${Math.min(depth, MAX_DEPTH) * 16}px` : 0 }}>
      <div className="flex gap-2 py-2">
        {/* Collapse gutter line */}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label={`Collapse reply from u/${reply.author.handle}`}
            className="group mt-0.5 flex shrink-0 flex-col items-center"
            title="Collapse thread"
          >
            <ReplyAvatar src={reply.author.avatar} handle={reply.author.handle} size={20} />
          </button>
          {/* Vertical collapse line */}
          {(localChildren.length > 0 || showReplyForm) && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse thread"
              className="w-px flex-1 cursor-pointer bg-[rgb(var(--border))] hover:bg-brand-500/50 transition-colors min-h-[8px]"
              style={{ minHeight: 8 }}
            />
          )}
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[rgb(var(--muted))]">
            <Link
              href={`/u/${reply.author.handle}`}
              className="font-medium text-[rgb(var(--fg))] hover:text-brand-500 transition-colors"
            >
              u/{reply.author.handle}
            </Link>
            <CloutBadge clout={reply.author.clout} />
            <span aria-hidden="true">·</span>
            <time dateTime={reply.createdAt}>{relativeTime(reply.createdAt)}</time>
          </div>

          {/* Body */}
          <div className="mt-1">
            {isRemoved ? (
              <p className="text-sm italic text-[rgb(var(--muted))]">[removed]</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-[rgb(var(--fg))]">
                <ReplyBody body={reply.body} />
              </div>
            )}
          </div>

          {/* Footer actions */}
          {!isRemoved && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <VoteButtons
                resourceId={reply.id}
                target="reply"
                initialHeat={reply.heat}
                initialUserVote={null}
                orientation="horizontal"
              />

              {session?.user && !isLocked && (
                <button
                  type="button"
                  onClick={() => setShowReplyForm((v) => !v)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[rgb(var(--muted))] hover:bg-[rgb(var(--border))] hover:text-[rgb(var(--fg))] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Reply
                </button>
              )}

              <ReportButton replyId={reply.id} />

              <ReplyModMenu
                replyId={reply.id}
                isRemoved={isRemoved}
                userRole={userRole}
                userHubRole={userHubRole}
                onUpdate={(removed) => setIsRemoved(removed)}
              />

              {isAuthor && !isModeratorOrWarden && (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Removing…' : 'Delete'}
                </button>
              )}
            </div>
          )}

          {/* Inline reply form */}
          {showReplyForm && (
            <div className="mt-2">
              <ReplyForm
                dropId={dropId}
                parentId={reply.id}
                onSuccess={handleReplySuccess}
                onCancel={() => setShowReplyForm(false)}
                placeholder={`Reply to u/${reply.author.handle}…`}
              />
            </div>
          )}

          {/* Children */}
          {!showContinueThread && localChildren.map((child) => (
            <ReplyCard
              key={child.id}
              reply={child}
              dropId={dropId}
              depth={depth + 1}
              onReplyAdded={onReplyAdded}
              isLocked={isLocked}
              userHubRole={userHubRole}
            />
          ))}

          {/* Continue thread */}
          {showContinueThread && (
            <div className="mt-2">
              <Link
                href={`/drops/${dropId}#reply-${localChildren[0]?.id ?? ''}`}
                className="text-sm text-brand-500 hover:underline"
              >
                Continue thread →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countDescendants(reply: Reply): number {
  let count = 0;
  if (reply.children) {
    for (const child of reply.children) {
      count += 1 + countDescendants(child);
    }
  }
  return count;
}
