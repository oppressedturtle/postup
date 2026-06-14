/**
 * Link preview scraper for PostUp.
 *
 * Fetches Open Graph metadata (og:title, og:description, og:image,
 * og:site_name) from a user-supplied URL, falling back to the HTML <title>
 * and <meta name="description"> tags when OG tags are absent.
 *
 * Security:
 *   - Every URL is first validated by `assertSafeUrl` (SSRF guard).
 *   - The response is capped at 1 MB to prevent memory exhaustion.
 *   - A 5 s timeout prevents slow-loris-style hangs.
 *   - A conservative User-Agent is sent so well-behaved crawl-disallow rules
 *     are respected.
 *
 * Caching:
 *   - Results are cached in Redis for 1 hour, keyed by `linkpreview:<sha256(url)>`.
 *   - Cache misses and Redis errors degrade gracefully (no throw to the caller).
 */
import { createHash } from "crypto";
import { JSDOM } from "jsdom";
import { redis } from "./redis";
import { assertSafeUrl } from "./ssrf-guard";
import logger from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkPreview {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  domain: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RESPONSE_BYTES = 1024 * 1024; // 1 MB
const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour
const USER_AGENT = "PostUp/1.0 (+https://github.com/oppressedturtle/postup)";

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function cacheKey(url: string): string {
  const hash = createHash("sha256").update(url).digest("hex");
  return `linkpreview:${hash}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fetch and parse link preview metadata for a user-supplied URL.
 *
 * Returns `null` when:
 *   - The URL is blocked by the SSRF guard
 *   - The network request fails or times out
 *   - The response cannot be parsed as HTML
 *
 * Never throws — all errors are logged and swallowed so that a failed preview
 * does not block the drop creation request.
 *
 * @param url  User-supplied URL string
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  // 1. SSRF guard
  try {
    await assertSafeUrl(url);
  } catch (err) {
    logger.warn({ url, err }, "linkPreview: SSRF guard blocked URL");
    return null;
  }

  const key = cacheKey(url);

  // 2. Redis cache read
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as LinkPreview;
    }
  } catch {
    // Cache miss — proceed to fetch
  }

  // 3. Fetch with timeout + size cap
  let html: string;
  let domain: string;
  try {
    const parsed = new URL(url);
    domain = parsed.hostname.replace(/^www\./, "");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      logger.debug({ url, status: response.status }, "linkPreview: non-2xx response");
      return null;
    }

    // Read up to MAX_RESPONSE_BYTES
    const reader = response.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          reader.cancel().catch(() => undefined);
          break;
        }
        chunks.push(value);
      }
    }

    html = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.byteLength + chunk.byteLength);
        merged.set(acc, 0);
        merged.set(chunk, acc.byteLength);
        return merged;
      }, new Uint8Array(0)),
    );
  } catch (err) {
    logger.debug({ url, err }, "linkPreview: fetch failed");
    return null;
  }

  // 4. Parse HTML with JSDOM
  let preview: LinkPreview;
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    function getMeta(property: string): string | null {
      const el =
        doc.querySelector(`meta[property="${property}"]`) ??
        doc.querySelector(`meta[name="${property}"]`);
      return el?.getAttribute("content") ?? null;
    }

    const title =
      getMeta("og:title") ??
      doc.querySelector("title")?.textContent?.trim() ??
      null;

    const description =
      getMeta("og:description") ??
      getMeta("description") ??
      null;

    const imageUrl = getMeta("og:image");

    // Normalize domain from og:site_name or parsed URL
    const siteName = getMeta("og:site_name");
    const resolvedDomain = siteName ?? domain;

    preview = { title, description, imageUrl, domain: resolvedDomain };
  } catch (err) {
    logger.debug({ url, err }, "linkPreview: HTML parse failed");
    return null;
  }

  // 5. Cache result
  try {
    await redis.set(key, JSON.stringify(preview), "EX", CACHE_TTL_SECONDS);
  } catch {
    // Non-fatal — cached next time
  }

  return preview;
}
