/**
 * S3/MinIO storage client for PostUp.
 *
 * Configured for MinIO with `forcePathStyle: true` — required because MinIO
 * uses path-style URL routing (`endpoint/bucket/key`) rather than the AWS
 * virtual-hosted style (`bucket.endpoint/key`).
 *
 * Key naming conventions:
 *   - User uploads:  `media/<userId>/<uuid>.<ext>`
 *   - Hub media:     `hubs/<slug>/<uuid>.<ext>`
 *
 * All public URLs are `${S3_ENDPOINT}/${S3_BUCKET}/${key}`.
 */
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { env } from "./env";

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: "us-east-1", // MinIO ignores region but SDK requires a value
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: true, // required for MinIO
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Upload a file to the configured MinIO bucket.
 *
 * Uses `@aws-sdk/lib-storage` Upload for multipart support on large files.
 * Returns the publicly-accessible URL for the stored object.
 *
 * @param key          Object key, e.g. `media/<userId>/<uuid>.webp`
 * @param buffer       File contents as a Buffer
 * @param contentType  MIME type, e.g. `image/webp`
 * @param size         Byte length — forwarded as Content-Length header
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
  size: number,
): Promise<string> {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: size,
    },
  });

  await upload.done();
  return getPublicUrl(key);
}

/**
 * Delete an object from the configured MinIO bucket.
 * Non-existent keys are treated as a no-op by MinIO (S3 spec).
 *
 * @param key  Object key to delete
 */
export async function deleteFile(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );
}

/**
 * Construct the public URL for a stored object without making a network call.
 *
 * @param key  Object key, e.g. `media/<userId>/<uuid>.webp`
 */
export function getPublicUrl(key: string): string {
  // Strip trailing slash from endpoint to avoid double-slashes
  const base = env.S3_ENDPOINT.replace(/\/$/, "");
  return `${base}/${env.S3_BUCKET}/${key}`;
}
