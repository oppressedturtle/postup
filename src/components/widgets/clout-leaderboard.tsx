import Link from 'next/link';

import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopUser {
  handle: string;
  displayName: string;
  avatar: string | null;
  clout: number;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function getTopUsers(): Promise<TopUser[]> {
  return db.user.findMany({
    orderBy: { clout: 'desc' },
    take: 10,
    select: {
      handle: true,
      displayName: true,
      avatar: true,
      clout: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function UserAvatar({ src, handle }: { src: string | null; handle: string }) {
  const initial = (handle[0] ?? 'U').toUpperCase();

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="h-7 w-7 shrink-0 rounded-full object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white"
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CloutLeaderboard
// ---------------------------------------------------------------------------

export async function CloutLeaderboard() {
  const users = await getTopUsers();

  if (users.length === 0) return null;

  return (
    <section
      aria-labelledby="clout-leaderboard-heading"
      className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4"
    >
      <h2
        id="clout-leaderboard-heading"
        className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-[rgb(var(--fg))]"
      >
        {/* Lightning bolt icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-brand-500"
          aria-hidden="true"
        >
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        Top Contributors
      </h2>

      <ol className="space-y-2">
        {users.map((user, index) => (
          <li key={user.handle}>
            <Link
              href={`/u/${user.handle}`}
              className="flex items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-[rgb(var(--border))]"
            >
              {/* Rank */}
              <span
                className={[
                  'w-5 shrink-0 text-center text-xs font-semibold tabular-nums',
                  index === 0
                    ? 'text-brand-500'
                    : index === 1
                      ? 'text-[rgb(var(--muted))]'
                      : index === 2
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-[rgb(var(--muted))]',
                ].join(' ')}
                aria-label={`Rank ${index + 1}`}
              >
                {index + 1}
              </span>

              {/* Avatar */}
              <UserAvatar src={user.avatar} handle={user.handle} />

              {/* Handle + display name */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[rgb(var(--fg))]">
                  {user.displayName || `u/${user.handle}`}
                </p>
                <p className="truncate text-[10px] text-[rgb(var(--muted))]">
                  u/{user.handle}
                </p>
              </div>

              {/* Clout score */}
              <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-brand-500">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                {user.clout.toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
