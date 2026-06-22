/**
 * /api/media/video
 *
 * POST — Upload a video file for use in a VIDEO Drop.
 *
 * Accepts multipart/form-data with a `file` field.
 * Videos are uploaded directly to MinIO without server-side transcoding —
 * transcoding and poster frame extraction are out of scope for Phase 3 and
 * will be handled by a background job in a later phase.
 *
 * TODO(Phase 4+): Queue a transcoding job after upload completes. Extract a
 * poster frame (thumbnail) using ffmpeg or a cloud video processing service
 * and store it at `media/<userId>/<uuid>-poster.webp`.
 *
 * Responses:
 *   200  { url: string, mimeType: string }
 *   400  missing file / wrong MIME type / too large
 *   401  unauthenticated
 *   429  rate limited (5 videos/hour per user)
 *   500  internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { fileTypeFromBuffer } from "file-type";

import { requireAuth } from "@/lib/auth-helpers";
import { uploadFile } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

// file-type returns 'video/quicktime' for .mov files
const ALLOWED_MIME_TYPES = new Map<string, string>([
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/quicktime", "mov"],
]);

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // Rate limit: 5 video uploads per hour per user
  const rl = await rateLimit(`media:video:${user.id}`, 5, 60 * 60);
  if (!rl.success) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "You can only upload 5 videos per hour." } },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.reset - Math.floor(Date.now() / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // Parse multipart
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request must be multipart/form-data." } },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "MISSING_FILE", message: "A `file` field is required." } },
      { status: 400 },
    );
  }

  // Validate size before reading the whole buffer
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: {
          code: "FILE_TOO_LARGE",
          message: "Video must be 500 MB or smaller.",
        },
      },
      { status: 400 },
    );
  }

  // Read buffer and validate via magic bytes (defence against MIME spoofing).
  // Video files go directly to S3 without server-side transcoding, so content
  // verification is the only guard against malicious uploads.
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);
  const ext = detected ? ALLOWED_MIME_TYPES.get(detected.mime) : undefined;

  if (!detected || !ext) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_MIME_TYPE",
          message: "Only mp4, webm, and mov videos are allowed.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const key = `media/${user.id}/${randomUUID()}.${ext}`;
    const url = await uploadFile(key, buffer, detected.mime, buffer.byteLength);

    logger.info(
      { userId: user.id, key, size: buffer.byteLength, mimeType: detected.mime },
      "media: video uploaded",
    );

    return NextResponse.json({ url, mimeType: detected.mime });
  } catch (err) {
    logger.error({ err, userId: user.id }, "media: video upload failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to upload video." } },
      { status: 500 },
    );
  }
}
