/**
 * /api/link-preview
 *
 * GET ?url=<url> — Fetch Open Graph metadata for a public URL.
 *
 * Public endpoint (auth not required). Rate-limited by IP to prevent abuse.
 *
 * Responses:
 *   200  { title, description, imageUrl, domain }
 *   400  missing or invalid `url` param
 *   404  no preview available for the given URL
 *   429  rate limited
 *   500  internal error
 */
import { NextRequest, NextResponse } from "next/server";

import { fetchLinkPreview } from "@/lib/link-preview";
import { rateLimit, extractClientIp } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Rate limit by IP: 30 requests per minute
  const ip = extractClientIp(request);
  const rl = await rateLimit(`linkpreview:ip:${ip}`, 30, 60);
  if (!rl.success) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.reset - Math.floor(Date.now() / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const { searchParams } = request.nextUrl;
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: { code: "MISSING_PARAM", message: "A `url` query parameter is required." } },
      { status: 400 },
    );
  }

  // Basic URL format check before handing off to fetchLinkPreview
  try {
    new URL(url);
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_URL", message: "The `url` parameter must be a valid URL." } },
      { status: 400 },
    );
  }

  try {
    const preview = await fetchLinkPreview(url);

    if (!preview) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "No preview available for this URL." } },
        { status: 404 },
      );
    }

    return NextResponse.json(preview);
  } catch (err) {
    logger.error({ err, url }, "linkPreview: GET handler failed");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch link preview." } },
      { status: 500 },
    );
  }
}
