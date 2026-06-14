import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { NotificationList } from './notification-list';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Your PostUp notifications.',
};

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 21, // Fetch 21 to detect if there's a next page
    }),
    db.notification.count({
      where: { userId, read: false },
    }),
  ]);

  let nextCursor: string | null = null;
  const items = [...notifications];
  if (items.length > 20) {
    items.pop();
    nextCursor = items[items.length - 1]?.id ?? null;
  }

  // Serialize for client
  const serialized = items.map((n) => ({
    id: n.id,
    type: n.type as 'REPLY_TO_DROP' | 'REPLY_TO_REPLY' | 'MENTION' | 'DROP_BOOSTED',
    read: n.read,
    payload: n.payload as Record<string, string | undefined>,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">Notifications</h1>
          {unreadCount > 0 && (
            <p className="mt-1 text-sm text-[rgb(var(--muted))]">
              {unreadCount} unread
            </p>
          )}
        </div>
      </div>

      <NotificationList
        initialNotifications={serialized}
        initialNextCursor={nextCursor}
        initialUnreadCount={unreadCount}
      />
    </div>
  );
}
