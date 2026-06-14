/**
 * oEmbed fetcher for PostUp.
 *
 * Supports YouTube, Vimeo, and Twitter/X via their respective oEmbed
 * JSON endpoints. The returned `html` field is sanitized through DOMPurify
 * before being stored or sent to clients — only iframe and blockquote embeds
 * with a strict attribute allowlist survive the sanitization pass.
 *
 * Security:
 *   - `assertSafeUrl` is called on the original user URL before any fetch.
 *   - oEmbed endpoint URLs are hardcoded — they are never derived from user
 *     input, which prevents endpoint injection.
 *   - The HTML returned from the oEmbed provider is sanitized via DOMPurify.
 *
 * Caching:
 *   - Results cached in Redis for 24 hours, keyed by `oembed:<sha256(url)>`.
 */
import { createHash } from "crypto";
import { assertSafeUrl } from "./ssrf-guard";
import { sanitizeHtml } from "./markdown";
import { redis } from "./redis";
import logger from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OEmbedResult {
  html: string;
  width: number;
  height: number;
  thumbnailUrl?: string;
}

// Minimal shape of an oEmbed JSON response
interface RawOEmbedResponse {
  html?: string;
  width?: number;
  height?: number;
  thumbnail_url?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const FETCH_TIMEOUT_MS = 5_000;
const USER_AGENT = "PostUp/1.0 (+https://github.com/oppressedturtle/postup)";

// ---------------------------------------------------------------------------
// Provider registry (hardcoded — never user-controlled)
// ---------------------------------------------------------------------------

interface OEmbedProvider {
  pattern: RegExp;
  endpoint: (url: string) => string;
}

const PROVIDERS: OEmbedProvider[] = [
  {
    pattern: /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch|youtu\.be\/)/,
    endpoint: (url) =>
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  },
  {
    pattern: /^https?:\/\/(?:www\.)?vimeo\.com\//,
    endpoint: (url) =>
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  },
  {
    pattern: /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\//,
    endpoint: (url) =>
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`,
  },
];

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function cacheKey(url: string): string {
  const hash = createHash("sha256").update(url).digest("hex");
  return `oembed:${hash}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fetch oEmbed data for a supported URL (YouTube, Vimeo, Twitter/X).
 *
 * Returns `null` when:
 *   - The URL is not supported by any registered provider
 *   - The SSRF guard blocks the URL
 *   - The oEmbed endpoint request fails
 *   - The response HTML is empty after sanitization
 *
 * Never throws.
 *
 * @param url  User-supplied URL (must match a supported provider)
 */
export async function fetchOEmbed(url: string): Promise<OEmbedResult | null> {
  // 1. SSRF guard on user URL
  try {
    await assertSafeUrl(url);
  } catch (err) {
    logger.warn({ url, err }, "oembed: SSRF guard blocked URL");
    return null;
  }

  // 2. Match provider
  const provider = PROVIDERS.find((p) => p.pattern.test(url));
  if (!provider) {
    return null;
  }

  const key = cacheKey(url);

  // 3. Redis cache read
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as OEmbedResult;
    }
  } catch {
    // Cache miss — proceed to fetch
  }

  // 4. Fetch oEmbed endpoint (endpoint URL is hardcoded — safe to fetch directly)
  const endpointUrl = provider.endpoint(url);
  let raw: RawOEmbedResponse;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(endpointUrl, {
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      logger.debug(
        { url, endpointUrl, status: response.status },
        "oembed: provider returned non-2xx",
      );
      return null;
    }

    raw = (await response.json()) as RawOEmbedResponse;
  } catch (err) {
    logger.debug({ url, err }, "oembed: fetch failed");
    return null;
  }

  // 5. Validate and sanitize
  if (!raw.html || typeof raw.html !== "string") {
    logger.debug({ url }, "oembed: response missing html field");
    return null;
  }

  const sanitizedHtml = sanitizeHtml(raw.html);
  if (!sanitizedHtml.trim()) {
    logger.debug({ url }, "oembed: sanitized html is empty");
    return null;
  }

  const result: OEmbedResult = {
    html: sanitizedHtml,
    width: typeof raw.width === "number" ? raw.width : 560,
    height: typeof raw.height === "number" ? raw.height : 315,
    ...(raw.thumbnail_url ? { thumbnailUrl: raw.thumbnail_url } : {}),
  };

  // 6. Cache result
  try {
    await redis.set(key, JSON.stringify(result), "EX", CACHE_TTL_SECONDS);
  } catch {
    // Non-fatal
  }

  return result;
}
