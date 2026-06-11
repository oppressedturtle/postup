/**
 * PATCH /api/user/profile
 *
 * Updates the authenticated user's display name and/or bio.
 *
 * Request body: { displayName?, bio? }
 *
 * Responses:
 *   200 { success: true, user: { displayName, bio } }
 *   400 invalid body shape
 *   401 not authenticated
 *   422 validation failure
 *   500 unexpected server error
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import logger from '@/lib/logger';

const profileSchema = z.object({
  displayName: z
    .string()
    .min(1, 'Display name cannot be empty.')
    .max(50, 'Display name must be 50 characters or fewer.')
    .optional(),
  bio: z
    .string()
    .max(300, 'Bio must be 300 characters or fewer.')
    .nullable()
    .optional(),
});

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'You must be signed in.' } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: 'Request body must be JSON.' } },
      { status: 400 },
    );
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid profile data.',
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { displayName, bio } = parsed.data;

  try {
    const updated = await db.user.update({
      where: { id: session.user.id },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(bio !== undefined && { bio }),
      },
      select: { displayName: true, bio: true },
    });

    logger.info({ userId: session.user.id }, 'user: profile updated');

    return NextResponse.json({ success: true, user: updated });
  } catch (err) {
    logger.error({ err, userId: session.user.id }, 'user: profile update failed');
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update profile.',
        },
      },
      { status: 500 },
    );
  }
}
