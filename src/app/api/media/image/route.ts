/**
 * /api/media/image
 *
 * POST — Upload an image file for use in a Drop or hub settings.
 *
 * Accepts multipart/form-data with a `file` field.
 * Processing pipeline:
 *   1. Validate size (≤ 20 MB) and magic bytes (MIME spoofing defence).
 *   2. Process with sharp: resize to max 2000 px wide, convert to WebP, strip EXIF.
 *   3. Upload to MinIO via `uploadFile()`.
 *   4. Return the public URL.
 *
 * Key format: `media/<userId>/<uuid>.webp`
 *
 * Responses:
 *   200  { url: string }
 *   400  missing file / wrong MIME type / too large
 *   401  unauthenticated
 *   429  rate limited (20 images/hour per user)
 *   500  internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";

import { requireAuth } from "@/lib/auth-helpers";
import { uploadFile } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_WIDTH_PX = 2000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // Rate limit: 20 image uploads per hour per user
  const rl = await rateLimit(`media:image:${user.id}`, 20, 60 * 60);
  if (!rl.success) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "You can only upload 20 images per hour." } },
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
          message: "Image must be 20 MB or smaller.",
        },
      },
      { status: 400 },
    );
  }

  // Read buffer and validate via magic bytes (defence against MIME spoofing)
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(inputBuffer);

  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_MIME_TYPE",
          message: "Only jpeg, png, gif, and webp images are allowed.",
        },
      },
      { status: 400 },
    );
  }

  try {
    // Process with sharp: resize, convert to WebP, strip EXIF metadata.
    // sharp validates the image format independently of the MIME check above,
    // providing an additional layer of defence against malformed inputs.
    const processedBuffer = await sharp(inputBuffer)
      .resize({ width: MAX_WIDTH_PX, withoutEnlargement: true })
      .webp({ quality: 85 })
      // withMetadata is omitted — sharp strips all metadata by default
      .toBuffer();

    const key = `media/${user.id}/${randomUUID()}.webp`;
    const url = await uploadFile(key, processedBuffer, "image/webp", processedBuffer.byteLength);

    logger.info({ userId: user.id, key, size: processedBuffer.byteLength }, "media: image uploaded");

    return NextResponse.json({ url });
  } catch (err) {
    logger.error({ err, userId: user.id }, "media: image upload failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to process or upload image." } },
      { status: 500 },
    );
  }
}
