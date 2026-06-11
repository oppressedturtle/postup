/**
 * POST /api/user/avatar
 *
 * Uploads a new avatar for the authenticated user.
 * Accepts multipart/form-data with a single `file` field.
 *
 * Constraints:
 *   - Image types only: jpeg, png, gif, webp
 *   - Max 5 MB
 *
 * In development, the file is written to public/avatars/<userId>.<ext>.
 * TODO(Phase 3): Replace local file storage with S3/MinIO upload.
 *
 * Responses:
 *   200 { avatarUrl: string }
 *   400 missing / invalid file
 *   401 not authenticated
 *   429 rate limit exceeded
 *   500 unexpected server error
 */
import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadLimiter } from "@/lib/rate-limit";
import logger from "@/lib/logger";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  // --- Auth check -----------------------------------------------------------
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "You must be signed in to upload an avatar." } },
      { status: 401 },
    );
  }

  const userId = session.user.id;

  // --- Rate limiting (keyed on userId) -------------------------------------
  const limit = await uploadLimiter(userId);
  if (!limit.success) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many upload attempts. Please try again later.",
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.reset),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(limit.reset),
        },
      },
    );
  }

  // --- Parse multipart/form-data -------------------------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Expected multipart/form-data." } },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "MISSING_FILE", message: "A `file` field is required." } },
      { status: 400 },
    );
  }

  // --- Validate MIME type ---------------------------------------------------
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_FILE_TYPE",
          message: "Only jpeg, png, gif, and webp images are accepted.",
        },
      },
      { status: 400 },
    );
  }

  // --- Validate size --------------------------------------------------------
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: {
          code: "FILE_TOO_LARGE",
          message: "Avatar must be 5 MB or smaller.",
        },
      },
      { status: 400 },
    );
  }

  // --- Persist file ---------------------------------------------------------
  // TODO(Phase 3): Replace local write with S3/MinIO upload via the S3 client.
  try {
    const ext = MIME_TO_EXT[file.type] ?? "bin";
    // Include a timestamp fragment to bust browser caches after re-uploads.
    const filename = `${userId}-${Date.now()}.${ext}`;
    const publicPath = `/avatars/${filename}`;
    const diskPath = path.join(process.cwd(), "public", "avatars", filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(diskPath, buffer);

    // Update user record
    await db.user.update({
      where: { id: userId },
      data: { avatar: publicPath },
    });

    logger.info({ userId, avatarUrl: publicPath }, "user: avatar updated");

    return NextResponse.json({ avatarUrl: publicPath });
  } catch (err) {
    logger.error({ err, userId }, "user: avatar upload failed");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Avatar upload failed due to an internal error.",
        },
      },
      { status: 500 },
    );
  }
}
