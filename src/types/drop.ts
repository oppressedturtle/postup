/**
 * Shared client-safe Drop shape returned by the API.
 * Matches the `dropInclude` shape used in /api/drops and /api/drops/[id].
 */
import type { DropType } from '@/generated/prisma/enums';

export interface DropAuthor {
  id: string;
  handle: string;
  displayName: string;
  avatar: string | null;
}

export interface DropHub {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

export interface DropCount {
  replies: number;
  votes: number;
}

/** The link preview JSON shape stored on drop.linkPreview (matches LinkPreview from src/lib/link-preview.ts) */
export interface LinkPreviewData {
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  domain?: string | null;
}

export interface Drop {
  id: string;
  title: string;
  type: DropType;
  body: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  linkUrl: string | null;
  linkPreview: LinkPreviewData | null;
  heat: number;
  isPinned: boolean;
  isLocked: boolean;
  isRemoved: boolean;
  createdAt: string; // serialised as ISO string from JSON
  updatedAt: string;
  hubId: string;
  authorId: string;
  author: DropAuthor;
  hub: DropHub;
  _count: DropCount;
}
