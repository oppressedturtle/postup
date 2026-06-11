/**
 * POST /api/user/password
 *
 * Updates the authenticated user's password.
 *
 * Request body: { currentPassword, newPassword }
 *
 * Responses:
 *   200 { success: true }
 *   400 invalid body shape
 *   401 not authenticated
 *   403 wrong current password
 *   422 validation failure
 *   500 unexpected server error
 */
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import logger from '@/lib/logger';

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters.'),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const parsed = passwordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid password data.',
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  try {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true },
    });

    if (!user?.passwordHash) {
      // OAuth-only accounts don't have a password to verify against
      return NextResponse.json(
        {
          error: {
            code: 'NO_PASSWORD',
            message:
              'This account uses OAuth sign-in and does not have a password set.',
          },
        },
        { status: 422 },
      );
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      logger.warn({ userId: session.user.id }, 'user: wrong current password');
      return NextResponse.json(
        {
          error: {
            code: 'WRONG_PASSWORD',
            message: 'Current password is incorrect.',
          },
        },
        { status: 403 },
      );
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db.user.update({
      where: { id: session.user.id },
      data: { passwordHash: newHash },
    });

    logger.info({ userId: session.user.id }, 'user: password updated');

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, userId: session.user.id }, 'user: password update failed');
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update password.',
        },
      },
      { status: 500 },
    );
  }
}
