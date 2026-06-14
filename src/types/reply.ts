/**
 * Shared client-safe Reply shape returned by the API.
 * Matches the `replySelect` shape used in /api/drops/[id]/replies.
 */

export interface Reply {
  id: string;
  body: string;
  isRemoved: boolean;
  heat: number;
  createdAt: string;
  updatedAt: string;
  parentId: string | null;
  author: {
    handle: string;
    avatar: string | null;
    clout: number;
  };
  _count: {
    children: number;
  };
  /** Client-assembled tree — populated by buildReplyTree(). */
  children?: Reply[];
}
