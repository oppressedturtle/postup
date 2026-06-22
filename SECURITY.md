# PostUp — Security

## Reporting vulnerabilities

Please report security issues privately to the maintainer rather than opening a public GitHub issue. A patch will be issued within 72 hours for confirmed vulnerabilities.

---

## Security measures implemented

### Authentication & sessions

- **Auth.js v5 (NextAuth)** with database-backed sessions — no JWTs stored client-side; session token lives in an httpOnly cookie set by the server.
- **bcrypt (12 rounds)** for password hashing. Credentials flow never reveals whether the email or password was wrong (constant-time comparison).
- **Login rate limiting** — 10 attempts per 15 minutes, keyed on both client IP **and** target email to prevent account targeting via IP rotation.
- **Registration rate limiting** — same 10/15 min IP limit.
- **Session callback** — suspended accounts have their sessions destroyed immediately; they cannot re-authenticate.
- **`requireAuth()` middleware** — defence-in-depth suspended check at the API layer. Catches stale session tokens that pre-date the suspension.

### Authorisation

- **`requireAuth()`** returns the session user or a 401 response; callers use `instanceof NextResponse` to guard the handler.
- **`requireWarden(hubId)`** / **`requireOverseer()`** — role checks centralised in `src/lib/auth-helpers.ts`; all moderation and admin routes use these helpers.
- Every mutating API endpoint is explicitly scoped to its minimum required role.
- Hub-ban enforcement uses Redis-cached ban records checked before writes; ban + membership deletion happen in a single Prisma transaction to prevent TOCTOU races.

### Injection prevention

- **Prisma ORM** — all database access goes through Prisma parameterised queries. No string interpolation into SQL.
- **Raw SQL** is used only for full-text search (`$queryRaw` tagged template literals) and the `ABS(heat)` expression. Both use Prisma's `sqltag` parameterisation; `Prisma.raw()` is used only for validated integer literals (never for strings).
- No `eval`, `Function()`, or `child_process.exec` with user-controlled input.

### XSS prevention

- **`renderMarkdown()`** (`src/lib/markdown.ts`) — remark → rehype → `rehype-sanitize` with a strict allowlist (no `<script>`, `<style>`, `<iframe>`, event attributes, `javascript:` hrefs). Output is safe for `dangerouslySetInnerHTML`.
- **`sanitizeHtml()`** — DOMPurify pass for oEmbed HTML. Allows only `<iframe>`, `<blockquote>`, `<a>`, `<p>`, `<br>`, `<strong>`, `<em>`, `<code>`, `<pre>`. Strips all event attributes.
- **`linkifyMentions()`** — negative lookbehind prevents re-linking handles already inside HTML attributes (`href`, `src`).
- **Content Security Policy** — set via `next.config.mjs` `headers()` on all routes. `script-src` is `'self' 'unsafe-inline'` (required by Next.js runtime chunks — see Future Work below).

### SSRF prevention

- **`assertSafeUrl()`** (`src/lib/ssrf-guard.ts`) — applied before every outbound HTTP request in `fetchLinkPreview()` and `fetchOEmbed()`.
  - Rejects non-http/https schemes (`file://`, `ftp://`, etc.).
  - Resolves the hostname via `dns.promises.lookup` before checking IP ranges — prevents DNS rebinding attacks.
  - Blocks RFC 1918/loopback/link-local ranges: `127.x`, `10.x`, `172.16–31.x`, `192.168.x`, `::1`, `169.254.x`, `fc00::/7`, `fe80::/10`.
- **oEmbed endpoint URLs are hardcoded** — user input is only used as a query parameter, never to derive the endpoint URL.
- **Link preview** — 5-second fetch timeout, 1 MB response cap (streaming read loop), results cached in Redis to minimise outbound requests.

### File upload hardening

All five upload endpoints (avatar, hub icon, hub banner, drop image, drop video) share the same defence-in-depth pattern:

1. **Size check** before reading the buffer (reject oversized files without buffering them).
2. **Magic bytes detection** via `file-type` — content is validated against known byte signatures, not the client-supplied `Content-Type`. The declared MIME must also match the detected MIME.
3. **No executable extensions** are in any allowlist. All images are transcoded to WebP by `sharp` before storage, so the original bytes never reach S3.
4. **S3/MinIO storage** — files are stored under `media/<userId>/<uuid>.<ext>`, never in a public web-accessible directory on the server.
5. **`sharp` EXIF stripping** — WebP conversion omits metadata by default; no `.withMetadata()` call.
6. **Upload rate limits** — 20 images/hour and 5 videos/hour per user, checked before parsing the request body.

### Security headers (all routes)

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-XSS-Protection` | `0` (legacy auditor disabled — see CSP) |
| `Content-Security-Policy` | see `next.config.mjs` |
| `X-DNS-Prefetch-Control` | `on` |

### Rate limiting

Redis sliding-window algorithm (atomic Lua script, no TOCTOU). All limiters use the `rateLimit(key, max, windowSeconds)` helper in `src/lib/rate-limit.ts`.

| Endpoint | Limit |
|---|---|
| Login / register | 10 req / 15 min (per IP + per email for login) |
| Drop creation | 10 / hour per user |
| Reply creation | 30 / hour per user |
| Report filing | 10 / hour per user |
| Image upload | 20 / hour per user |
| Video upload | 5 / hour per user |
| Link preview | 30 / min per IP |
| Vote | 60 / min per user (shared across drop + reply votes) |
| Hub creation | 3 / day per user |

### Dependency security

- **Next.js 14.2.35** — latest patch release; addresses all known CVEs including auth bypass (GHSA-7gfc-8cq8-jh5f), cache poisoning (GHSA-gp8f-8m3g-qvj9), middleware redirect SSRF (GHSA-4342-x723-ch2f), and others.
- `npm audit` is run as part of CI. Dev-only CVEs (esbuild via vitest, eslint glob) do not affect the production bundle.

### Secrets management

- All secrets are loaded via `src/lib/env.ts` (Zod schema) — the app fails fast at startup with a descriptive error if any required variable is missing.
- `.env` is in `.gitignore`. `.env.example` and `.env.production.example` contain only placeholder values.
- `NEXTAUTH_SECRET` minimum 16 characters enforced by the Zod schema.

---

## Known limitations / future work

- **CSP `unsafe-inline` for scripts** — Next.js 14 App Router requires `unsafe-inline` because it injects runtime hydration scripts without nonces. Migrating to nonce-based CSP requires Next.js 15+ with `experimental.nonce` or a custom `nonce` middleware. This is the highest-priority CSP improvement for a future phase.
- **Video content validation** — videos are stored without server-side transcoding. Magic bytes validation (`file-type`) catches most cases but does not guarantee the video is well-formed. A future transcoding pipeline (ffmpeg) would provide stronger content verification.
- **Account deletion** is not yet implemented — the danger zone in settings shows "Coming soon". Deletion requires cascade cleanup of drops, replies, votes, and S3 objects.
- **OAuth PKCE** — currently uses Auth.js defaults; explicit PKCE configuration for the GitHub/Google providers should be reviewed for production.
