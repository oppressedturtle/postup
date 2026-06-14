import type { Reply } from '@/types/reply';

export type ReplySort = 'best' | 'top' | 'new' | 'controversial';

/**
 * Takes a flat reply array from the API and returns top-level replies
 * with nested `children` arrays assembled recursively.
 *
 * Each level is sorted according to `sort`:
 *   best          → heat DESC, createdAt ASC (stable tiebreak)
 *   top           → heat DESC
 *   new           → createdAt DESC
 *   controversial → abs(heat) DESC
 */
export function buildReplyTree(flat: Reply[], sort: ReplySort = 'best'): Reply[] {
  // Attach the clout field from API shape — the author select in the API
  // returns id/handle/displayName/avatar; clout is not selected there.
  // We default to 0 when missing so the type remains consistent.
  const enriched: Reply[] = flat.map((r) => ({
    ...r,
    author: {
      handle: r.author.handle,
      avatar: r.author.avatar,
      clout: r.author.clout ?? 0,
    },
    children: [],
  }));

  const map = new Map<string, Reply>(enriched.map((r) => [r.id, r]));
  const roots: Reply[] = [];

  for (const reply of enriched) {
    if (reply.parentId && map.has(reply.parentId)) {
      const parent = map.get(reply.parentId)!;
      parent.children = parent.children ?? [];
      parent.children.push(reply);
    } else {
      roots.push(reply);
    }
  }

  // Sort each level
  const comparator = makeComparator(sort);
  sortLevel(roots, comparator);

  return roots;
}

type Comparator = (a: Reply, b: Reply) => number;

function makeComparator(sort: ReplySort): Comparator {
  switch (sort) {
    case 'best':
      return (a, b) =>
        b.heat - a.heat || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    case 'top':
      return (a, b) => b.heat - a.heat;
    case 'new':
      return (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    case 'controversial':
      return (a, b) => Math.abs(b.heat) - Math.abs(a.heat);
  }
}

function sortLevel(replies: Reply[], comparator: Comparator): void {
  replies.sort(comparator);
  for (const reply of replies) {
    if (reply.children && reply.children.length > 0) {
      sortLevel(reply.children, comparator);
    }
  }
}
