import Link from 'next/link';
import Image from 'next/image';

import { JoinButton } from './join-button';

export interface HubCardData {
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  nsfw: boolean;
  memberCount: number;
}

interface HubCardProps {
  hub: HubCardData;
  /** Whether the viewing user is already a member of this hub */
  isMember: boolean;
}

export function HubCard({ hub, isMember }: HubCardProps) {
  const initial = (hub.name[0] ?? 'H').toUpperCase();

  return (
    <article className="border-app bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <Link href={`/h/${hub.slug}`} tabIndex={-1} aria-hidden="true">
          <HubIcon src={hub.icon} initial={initial} size={40} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/h/${hub.slug}`}
              className="font-semibold text-[rgb(var(--fg))] hover:text-brand-500 transition-colors"
            >
              h/{hub.slug}
            </Link>
            {hub.nsfw && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                NSFW
              </span>
            )}
          </div>
          <p className="text-xs text-[rgb(var(--muted))]">
            {hub.memberCount.toLocaleString()} member{hub.memberCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {hub.description && (
        <p className="line-clamp-2 text-sm text-[rgb(var(--fg))]">
          {hub.description}
        </p>
      )}

      <div className="mt-auto">
        <JoinButton
          hubSlug={hub.slug}
          initialIsMember={isMember}
          initialMemberCount={hub.memberCount}
        />
      </div>
    </article>
  );
}

interface HubIconProps {
  src: string | null;
  initial: string;
  size: number;
}

export function HubIcon({ src, initial, size }: HubIconProps) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-500 font-bold text-white"
    >
      {initial}
    </span>
  );
}
