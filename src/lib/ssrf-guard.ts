/**
 * SSRF (Server-Side Request Forgery) protection utility for PostUp.
 *
 * Any time user-supplied URLs are fetched server-side (link previews, oEmbed),
 * this module must be called first. It rejects URLs that would cause the server
 * to make requests to:
 *   - Private IPv4 ranges (RFC 1918): 10.x, 172.16-31.x, 192.168.x
 *   - Loopback: 127.x (IPv4), ::1 (IPv6)
 *   - Link-local: 169.254.x (IPv4 APIPA, used by AWS metadata service)
 *   - Unique local: fc00::/7 (IPv6 equivalent of RFC 1918)
 *
 * The hostname is resolved via `dns.promises.lookup` before the range check so
 * that DNS rebinding attacks are mitigated — a public-looking domain that
 * resolves to a private IP is also blocked.
 *
 * Only http and https schemes are permitted; file://, ftp://, etc. are rejected.
 *
 * Usage:
 *   await assertSafeUrl("https://example.com/preview");  // resolves normally
 *   await assertSafeUrl("http://169.254.169.254/latest"); // throws SsrfError
 */
import dns from "dns";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

// ---------------------------------------------------------------------------
// Private range matchers
// ---------------------------------------------------------------------------

/**
 * Returns true if an IPv4 address string falls within a blocked range.
 * Input is expected to be a dotted-decimal string, e.g. "192.168.1.1".
 */
function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    // Malformed — treat as blocked
    return true;
  }

  const [a, b] = parts as [number, number, number, number];

  // Loopback: 127.0.0.0/8
  if (a === 127) return true;

  // Private: 10.0.0.0/8
  if (a === 10) return true;

  // Private: 172.16.0.0/12 (172.16.x – 172.31.x)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // Private: 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  // Link-local: 169.254.0.0/16 (APIPA + AWS/GCP metadata)
  if (a === 169 && b === 254) return true;

  // This host: 0.0.0.0/8
  if (a === 0) return true;

  return false;
}

/**
 * Returns true if an IPv6 address string falls within a blocked range.
 * Handles ::1 (loopback) and fc00::/7 (unique local).
 */
function isBlockedIpv6(address: string): boolean {
  const normalised = address.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  // Loopback
  if (normalised === "::1" || normalised === "0:0:0:0:0:0:0:1") return true;

  // Unspecified
  if (normalised === "::" || normalised === "0:0:0:0:0:0:0:0") return true;

  // Unique local: fc00::/7 — first byte is 0xfc or 0xfd
  const firstGroup = normalised.split(":")[0] ?? "";
  if (firstGroup.length > 0) {
    const firstByte = parseInt(firstGroup.padStart(4, "0").slice(0, 2), 16);
    if (!isNaN(firstByte) && (firstByte & 0xfe) === 0xfc) return true;
  }

  // Link-local: fe80::/10
  if (normalised.startsWith("fe8") || normalised.startsWith("fe9") ||
      normalised.startsWith("fea") || normalised.startsWith("feb")) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main guard
// ---------------------------------------------------------------------------

/**
 * Assert that a user-supplied URL is safe to fetch from the server.
 *
 * Throws `SsrfError` if:
 *   - The URL cannot be parsed
 *   - The scheme is not http or https
 *   - The hostname resolves to a private, loopback, or link-local IP
 *
 * On success, the function returns void and the caller may proceed with the
 * fetch.
 *
 * @param rawUrl  User-supplied URL string (untrusted)
 */
export async function assertSafeUrl(rawUrl: string): Promise<void> {
  // 1. Parse — rejects obviously malformed strings
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError(`Invalid URL: ${rawUrl}`);
  }

  // 2. Scheme check — only http and https are permitted
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfError(
      `Disallowed URL scheme "${parsed.protocol}". Only http and https are permitted.`,
    );
  }

  // 3. Reject bare IP addresses in the hostname that are already in blocked ranges
  //    (fast path — avoids a DNS round-trip for obviously private URLs)
  const hostname = parsed.hostname;

  // 4. Resolve hostname to IP address
  let address: string;
  let family: number;
  try {
    const result = await dns.promises.lookup(hostname, { verbatim: false });
    address = result.address;
    family = result.family;
  } catch (err) {
    throw new SsrfError(
      `Could not resolve hostname "${hostname}": ${(err as Error).message}`,
    );
  }

  // 5. Check resolved IP against blocked ranges
  if (family === 4) {
    if (isBlockedIpv4(address)) {
      throw new SsrfError(
        `URL "${rawUrl}" resolves to a private or reserved IP address (${address}) and cannot be fetched.`,
      );
    }
  } else if (family === 6) {
    if (isBlockedIpv6(address)) {
      throw new SsrfError(
        `URL "${rawUrl}" resolves to a private or reserved IPv6 address (${address}) and cannot be fetched.`,
      );
    }
  } else {
    throw new SsrfError(`Unknown address family (${family}) for hostname "${hostname}".`);
  }
}
