/**
 * POST /api/hubs/[slug]/banner
 *
 * Upload a hub banner image (WARDEN or OVERSEER only).
 * Accepts multipart/form-data with a single `file` field.
 *
 * Constraints:
 *   - Image types only: jpeg, png, webp (validated via magic bytes)
 *   - Max 5 MB
 *   - Recommended dimensions: 1200×300 px
 *
 * File is stored in S3/MinIO at hubs/<slug>/banner-<uuid>.<ext>.
 * The Hub.banner field is updated to the S3 public URL.
 *
 * Responses:
 *   200 { bannerUrl: string }
 *   400 missing / invalid file
 *   401 not authenticated
 *   403 not warden or overseer
 *   404 hub not found
 *   429 rate limited
 *   500 internal error
 */
import { NextRequest, NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";

import { db } from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { uploadLimiter } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-helpers";
import logger from "@/lib/logger";

type RouteContext = { params: Promise<{ slug: string }> };

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;

  // --- Auth -----------------------------------------------------------------
  const userOrResponse = await requireAuth();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  // --- Fetch hub ------------------------------------------------------------
  const hub = await db.hub.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!hub) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Hub "${slug}" not found.` } },
      { status: 404 },
    );
  }

  // --- Authorization: OVERSEER or hub WARDEN --------------------------------
  if (user.role !== "OVERSEER") {
    const membership = await db.membership.findUnique({
      where: { userId_hubId: { userId: user.id, hubId: hub.id } },
    });
    if (!membership || membership.role !== "WARDEN") {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message:
              "You must be a Warden of this hub or an Overseer to upload a banner.",
          },
        },
        { status: 403 },
      );
    }
  }

  // --- Rate limiting --------------------------------------------------------
  const rl = await uploadLimiter(user.id);
  if (!rl.success) {
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
          "Retry-After": String(rl.reset),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rl.reset),
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
      {
        error: {
          code: "INVALID_BODY",
          message: "Expected multipart/form-data.",
        },
      },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      {
        error: {
          code: "MISSING_FILE",
          message: "A `file` field is required.",
        },
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: {
          code: "FILE_TOO_LARGE",
          message: "Hub banner must be 5 MB or smaller.",
        },
      },
      { status: 400 },
    );
  }

  // --- Read buffer and validate via magic bytes (MIME spoofing defence) -----
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);

  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_FILE_TYPE",
          message: "Only jpeg, png, and webp images are accepted for banners.",
        },
      },
      { status: 400 },
    );
  }

  if (file.type && file.type !== detected.mime) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_FILE_TYPE",
          message: "File content does not match its declared type.",
        },
      },
      { status: 400 },
    );
  }

  // --- Upload to S3/MinIO --------------------------------------------------
  try {
    const ext = MIME_TO_EXT[detected.mime] ?? "bin";
    const key = `hubs/${slug}/banner-${crypto.randomUUID()}.${ext}`;

    const bannerUrl = await uploadFile(key, buffer, detected.mime, buffer.length);

    await db.hub.update({
      where: { id: hub.id },
      data: { banner: bannerUrl },
    });

    logger.info(
      { userId: user.id, hubId: hub.id, bannerUrl },
      "hub: banner updated",
    );

    return NextResponse.json({ bannerUrl });
  } catch (err) {
    logger.error({ err, userId: user.id, hubId: hub.id }, "hub: banner upload failed");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Banner upload failed due to an internal error.",
        },
      },
      { status: 500 },
    );
  }
}
