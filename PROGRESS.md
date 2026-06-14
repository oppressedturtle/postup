# PostUp — Progress Log

## 2026-06-14 — Phase 3 backend: Drop CRUD, media uploads, link previews, oEmbed, SSRF guard

### Created / Modified

- **`src/lib/storage.ts`** — S3/MinIO client:
  - `S3Client` with `forcePathStyle: true` (required for MinIO), singleton pattern
  - `uploadFile(key, buffer, contentType, size)`: uses `@aws-sdk/lib-storage` Upload for
    multipart support; returns public URL `${S3_ENDPOINT}/${S3_BUCKET}/${key}`
  - `deleteFile(key)`: `DeleteObjectCommand`, non-existent keys treated as no-op
  - `getPublicUrl(key)`: constructs URL without network call; strips trailing slash from endpoint

- **`src/lib/markdown.ts`** — Markdown pipeline + HTML sanitizer:
  - `renderMarkdown(raw)`: remark-parse → remark-rehype → rehype-sanitize (strict allowlist:
    p, h1–h4, ul, ol, li, blockquote, code, pre, strong, em, a[href], img[src alt], br, hr) →
    rehype-stringify. Processor created once and shared across calls.
  - `sanitizeHtml(html)`: DOMPurify pass for raw HTML (oEmbed). Allows only
    `iframe[src allow allowfullscreen]`, `blockquote`, `a`, `p`, `br`, `strong`, `em`,
    `code`, `pre`. Strips all event attributes and `data-*` attrs.

- **`src/lib/ssrf-guard.ts`** — SSRF protection:
  - `assertSafeUrl(url)`: rejects non-http/https schemes; resolves hostname via
    `dns.promises.lookup` (mitigates DNS rebinding); blocks 127.x, 10.x,
    172.16–31.x, 192.168.x, ::1, 169.254.x, fc00::/7, fe80::/10
  - Exports `SsrfError` for typed catch blocks in callers

- **`src/lib/link-preview.ts`** — OG metadata scraper:
  - `fetchLinkPreview(url)`: SSRF guard → Redis cache check (1 hour, key
    `linkpreview:<sha256(url)>`) → fetch with 5s timeout + 1 MB response cap (streaming
    read loop) + `User-Agent: PostUp/1.0` → JSDOM parse → og:title/description/image/
    site_name with fallback to `<title>` + `<meta name="description">` → cache + return
  - Returns `{ title, description, imageUrl, domain }` or null; never throws

- **`src/lib/oembed.ts`** — oEmbed fetcher:
  - `fetchOEmbed(url)`: SSRF guard → provider match (YouTube, Vimeo, Twitter/X via
    hardcoded regex patterns) → Redis cache check (24 hours, key `oembed:<sha256(url)>`)
    → fetch oEmbed endpoint with 5s timeout → DOMPurify sanitize returned HTML
    (iframe/blockquote/a only) → cache + return
  - oEmbed endpoint URLs are hardcoded — never derived from user input (prevents endpoint
    injection). Returns `{ html, width, height, thumbnailUrl? }` or null; never throws

- **`src/app/api/drops/route.ts`** — Drop collection:
  - `POST`: auth required + hub membership check. Zod discriminated union per drop type
    (TEXT/IMAGE/VIDEO/LINK). LINK drops trigger `fetchLinkPreview` async and store result
    in `Drop.linkPreview` (JSON field). Rate limited: 10 drops/hour per user. Invalidates
    `feed:<hub>:*` and `feed:all:*` Redis keys on create. Returns 201 + drop.
  - `GET`: public feed. Params: `hubSlug?`, `sort` (hot|rising|fresh|top), `limit` (≤50),
    `cursor`. Sort logic: hot/top → heat DESC + createdAt DESC; fresh → createdAt DESC;
    rising → heat DESC + createdAt DESC WHERE createdAt > NOW()-24h. Redis cache 30s per
    (hubSlug, sort, cursor). Returns `{ drops, nextCursor }`.

- **`src/app/api/drops/[id]/route.ts`** — Drop detail:
  - `GET`: public; drop + author + hub + `_count.replies`. Redis cache 60s.
  - `PATCH`: author only; TEXT drops only; updates `title` + `body`. Invalidates drop
    cache + all feed caches.
  - `DELETE`: author, hub WARDEN, or OVERSEER. Soft-delete: `isRemoved=true`, clears
    `body`, `imageUrl`, `videoUrl`, `linkUrl`, `linkPreview`. Invalidates caches.

- **`src/app/api/media/image/route.ts`** — Image upload:
  - Auth required. Rate limited: 20/hour per user.
  - Validates MIME type (jpeg/png/gif/webp) and size (≤ 20 MB).
  - sharp pipeline: resize max 2000 px wide (without enlargement), convert to WebP at 85%
    quality, strip EXIF (sharp default). Key: `media/<userId>/<uuid>.webp`.
  - Uploads via `uploadFile()`. Returns `{ url }`.

- **`src/app/api/media/video/route.ts`** — Video upload:
  - Auth required. Rate limited: 5/hour per user.
  - Validates MIME type (mp4/webm/mov) and size (≤ 500 MB). Direct upload, no transcoding.
  - Key: `media/<userId>/<uuid>.<ext>`. Returns `{ url, mimeType }`.

- **`src/app/api/link-preview/route.ts`** — Link preview endpoint:
  - `GET ?url=<url>`: IP-based rate limit (30/min). Calls `fetchLinkPreview(url)`.
  - Returns preview JSON or 404. Validates URL format before delegating.

- **`src/middleware.ts`** — Added to public allow-list:
  - `/api/drops` (GET public; POST auth enforced in handler)
  - `/api/drops/[id]` (GET public; PATCH/DELETE auth enforced in handler)
  - `/api/link-preview` (rate-limited in handler)

### Key decisions
- **SSRF guard does DNS resolution** before IP range checks — a public-looking domain that
  resolves to a private IP is blocked (DNS rebinding protection).
- **oEmbed endpoints are hardcoded** — user URL is only used to match a provider and as a
  query parameter; the endpoint URL itself is never derived from user input.
- **Link preview never throws** — any failure returns null so drop creation is never blocked
  by a slow or unreachable upstream.
- **sharp strips EXIF by default** — no need for `.keepMetadata(false)`; the WebP conversion
  inherently drops all metadata unless `.withMetadata()` is called.
- **Video uploads are direct** (no server transcoding) — transcoding deferred to Phase 4+
  background job queue.

### Verified
- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

- **Phase 3 — backend complete, frontend in progress.**
- **Next:** Phase 3 frontend — Drop creation form, feed page, Drop detail page, media upload UI.

## 2026-06-11 — Phase 2 frontend: Hub page, create-hub flow, hub settings, membership UI, hub discovery

### Created / Modified

- **`src/components/hubs/join-button.tsx`** — `"use client"` `JoinButton` component:
  - Props: `hubSlug`, `initialIsMember`, `initialMemberCount`, optional `className`
  - Unauthenticated clicks redirect to `/login` via `useRouter`
  - POST / DELETE `/api/hubs/[slug]/membership` with optimistic UI update (count + state)
  - Inline loading spinner during request; rolls back optimistic state on error
  - Full ARIA: `aria-pressed`, `aria-label`, `disabled` during loading

- **`src/components/hubs/hub-card.tsx`** — Reusable `HubCard` + `HubIcon`:
  - 40 px icon (image or letter fallback), hub name link, member count, description snippet
  - NSFW badge, `JoinButton` embedded
  - `HubIcon` exported separately for use on the hub page

- **`src/app/h/[slug]/page.tsx`** — Hub page (server component):
  - Fetches hub via Prisma with `_count.memberships/drops`, creator, and up to 5 wardens
  - `notFound()` on miss; `generateMetadata` with name + description
  - Full-width 200 px banner (gradient fallback using brand-500/600 if none set)
  - Hub header: icon overlapping banner with border, name, member/drop counts, NSFW badge,
    `JoinButton`
  - Two-column layout (main + sidebar): main shows empty drops state; sidebar has About
    card (description + rules collapsible), Stats (members, drops, created date), Wardens
    list (up to 5 with `/u/` links), Create Drop CTA for members
  - NSFW alert banner shown at the top when `hub.nsfw === true`

- **`src/app/h/create/page.tsx`** — Create Hub page (server component):
  - Auth guard: redirects to `/login?callbackUrl=/h/create` if unauthenticated
  - Renders `CreateHubForm` inside a card

- **`src/app/h/create/create-hub-form.tsx`** — `"use client"` `CreateHubForm`:
  - Fields: name (with `h/` gutter + live preview + regex validation), description (500
    char counter), rules (optional, 2000 char counter), nsfw toggle
  - Full client-side validation before submit; POST `/api/hubs`
  - Maps 409 → "That hub name is taken"; 429 → rate limit message; 422 → field errors
  - On 201: `router.push(/h/<name>)`

- **`src/app/h/[slug]/settings/page.tsx`** — Hub settings page (server component):
  - Auth guard + WARDEN/OVERSEER check via Prisma membership lookup
  - Redirects to `/h/[slug]` if not authorized
  - Sections: Identity, Icon upload, Banner upload, Warden management, Danger zone
    (OVERSEER only)

- **`src/app/h/[slug]/settings/identity-form.tsx`** — `"use client"`: description, rules,
  NSFW toggle. PATCH `/api/hubs/[slug]`. Inline success/error feedback.

- **`src/app/h/[slug]/settings/media-form.tsx`** — `"use client"`: XHR upload with
  progress bar for icon (max 2 MB) and banner (max 5 MB). Local FileReader preview.

- **`src/app/h/[slug]/settings/warden-form.tsx`** — `"use client"`: lists current wardens
  with demote buttons (cannot demote creator); promote-by-handle form that POST/DELETE
  `/api/hubs/[slug]/wardens` and refreshes the list.

- **`src/app/h/[slug]/settings/delete-hub-button.tsx`** — `"use client"`: two-step
  confirmation inline (no modal dependency); DELETE `/api/hubs/[slug]`; redirects to
  `/hubs` on success.

- **`src/app/hubs/page.tsx`** — Hub discovery page (server component):
  - Fetches up to 50 hubs via Prisma with `_count.memberships`
  - Popular / New sort tabs (URL-driven via `searchParams`)
  - Create Hub CTA for authenticated users
  - Grid of `HubCard`s; empty state with CTA
  - `HubSearch` client component for real-time search

- **`src/app/hubs/hub-search.tsx`** — `"use client"` `HubSearch`:
  - Debounced (300 ms) fetch to `/api/hubs?q=...&sort=popular`
  - Shows search results as `HubCard` grid; empty state for no results
  - Loading spinner, error state

- **`src/components/site-header.tsx`** — Updated to async server component:
  - Added "Hubs" link → `/hubs`
  - Added "Create Hub" link (hidden on mobile) — visible only when authenticated
  - Calls `auth()` server-side to determine visibility

### Verified
- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

- **Phase 2 — COMPLETE.**
- **Next:** Phase 3 — Drops (Posts) & Media: Drop model, create drop (text/image/video/link),
  rich text editor, media uploads, link previews, OEmbed, Drop detail page.

## 2026-06-08 — Project kickoff
- Project created and added to the autonomous build pipeline (builds alongside CollabBoard).
- Defined full roadmap (10 phases) and the PostUp lexicon (Hubs, Drops, Boost/Bury, Heat, Clout, Wardens, Overseers, The Stream, Stash).
- Foundation files committed: README (with lexicon + features), MIT LICENSE, .gitignore.
- Public repo created under oppressedturtle.
- **Next:** Phase 0 — scaffold Next.js + TypeScript + Tailwind, Prisma/Postgres, Redis, Docker Compose.

## 2026-06-10 — Phase 0: Next.js app scaffold + theming
- Scaffolded the Next.js 14 App Router app: TypeScript (strict, `noUncheckedIndexedAccess`),
  Tailwind 3 with a PostUp "Heat" brand palette, PostCSS/autoprefixer, ESLint
  (`next/core-web-vitals` + prettier) and Prettier (+ tailwind plugin).
- Theming: SSR-safe `ThemeProvider` (light/dark) persisting to localStorage, a no-flash
  inline `<head>` script honoring stored choice → system preference, and a `ThemeToggle`.
  CSS variables drive surface/card/border/text colors across themes.
- Base layout: sticky `SiteHeader` (brand + The Stream link + toggle), metadata template,
  and a home page (hero + feature cards using the lexicon: Hubs, Drops, Boost/Bury, Clout).
- Verified: typecheck ✓, eslint ✓ (0 warnings), `next build` ✓ (static prerender), vitest 3/3 ✓.
- **Roadmap:** Phase 0 — 1/5 (app scaffold + theme done).
- **Next:** Phase 0 item 2 — Postgres + Prisma setup, initial schema migration, seed scaffold.

## 2026-06-11 — Phase 0: Prisma + Postgres setup, initial schema, seed scaffold

- Installed **Prisma 7.8** + `@prisma/client`, `@prisma/adapter-pg`, `pg` (production deps).
- Installed `bcryptjs`, `ts-node`, `dotenv` (dev deps for seed + config).
- Initialised Prisma with `npx prisma init --datasource-provider postgresql`.
  - Adapted for **Prisma 7** conventions: datasource URL lives in `prisma.config.ts` (not
    `schema.prisma`); generator uses the new `prisma-client` provider outputting to
    `src/generated/prisma/`; driver adapter (`PrismaPg`) is passed to `PrismaClient` at
    construction time.
- Wrote full **foundation schema** (`prisma/schema.prisma`) covering all domain models for
  the complete platform — no raw new models needed in later phases, only field/relation additions:
  - Auth.js adapter models: `Account`, `Session`, `VerificationToken`
  - Core domain: `User` (with `Role` enum), `Hub`, `Membership` (with `MembershipRole`),
    `Drop` (with `DropType`), `Reply` (self-referential threading via `parentId`),
    `Vote` (+1/−1 polymorphic on Drop or Reply), `Stash` (saved drops)
  - All relations carry explicit `onDelete` cascades; hot-path columns carry composite indexes
    (`Drop` by `(hubId, createdAt DESC)`, `Stash` by `(userId, savedAt DESC)`, etc.)
  - Long text fields use `@db.Text`; `heat` is a denormalised net score updated by app logic.
- Ran `npx prisma generate` — Prisma Client generated to `src/generated/prisma/` ✓.
- Added `src/lib/db.ts` — singleton `PrismaClient` (dev hot-reload safe via `globalThis`).
- Created `.env` with local dev credentials (Postgres, NextAuth, Redis, MinIO S3).
- Created `.env.example` (safe to commit; all values are placeholders).
- Wrote `prisma/seed.ts` — scaffold seed creating 2 users (OVERSEER + MEMBER), 2 Hubs
  (gaming, programming), memberships, and 1 TEXT Drop each. Uses `bcrypt` (12 rounds) and
  `upsert` for idempotency. Wired via `"prisma": { "seed": "ts-node …" }` in `package.json`.
- Added convenience npm scripts: `db:generate`, `db:migrate`, `db:seed`, `db:studio`.
- Updated `.gitignore`: excludes `/src/generated/`, keeps `.env.example` tracked.
- Verified: `tsc --noEmit` ✓ (0 errors).
- **Note:** `prisma migrate dev` intentionally not run — no live Postgres in CI; run it
  locally once `docker compose up -d` has the DB ready.
- **Roadmap:** Phase 0 — 2/5.
- **Next:** Phase 0 item 3 — Docker Compose (Postgres, Redis, MinIO), dev environment setup.

## 2026-06-11 — Phase 0: Redis, env validation, structured logging, Docker Compose, Dockerfile

### Installed
- `zod` (prod) — schema-based environment validation
- `ioredis` (prod) — Redis client with TypeScript support (ships own types)
- `pino` + `pino-pretty` (prod) — structured JSON logger with dev pretty-print

### Created / Modified
- **`src/lib/env.ts`** — Zod-validated env config. Reads `process.env` once at module
  load; throws a descriptive multi-line error at startup if any required variable is
  missing or malformed. Covers `DATABASE_URL`, `NEXTAUTH_SECRET` (min 16 chars),
  `NEXTAUTH_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
  `S3_BUCKET`, `NODE_ENV`. All app code must import env vars from this module —
  never from raw `process.env`.
- **`src/lib/redis.ts`** — ioredis singleton using the `globalThis` pattern (mirrors
  the Prisma client pattern to survive Next.js hot-reloads). Exports `redis` instance
  and a `ping()` helper for healthchecks. Redis errors are logged but don't crash the
  process — callers should degrade gracefully on cache miss.
- **`src/lib/logger.ts`** — pino logger with `service: "postup"` base binding.
  Development: pino-pretty (coloured, human-readable, no pid/hostname noise).
  Production: newline-delimited JSON to stdout. `debug` level in dev, `info` in prod.
  Supports `.child({ requestId, userId })` for request-scoped context.
- **`src/lib/db.ts`** — updated to import `DATABASE_URL` and `NODE_ENV` from
  `src/lib/env.ts` instead of raw `process.env`.
- **`docker-compose.yml`** — three services on a shared `postup` bridge network:
  - `postgres:16-alpine` (port 5432, healthcheck: `pg_isready`)
  - `redis:7-alpine` (port 6379, AOF persistence, healthcheck: `redis-cli ping`)
  - `minio/minio:latest` (ports 9000 API + 9001 console, healthcheck: curl health endpoint)
  - `app` service defined but commented out — use `npm run dev` locally in dev.
  - Named volumes: `postgres_data`, `redis_data`, `minio_data`.
- **`Dockerfile`** — three-stage production build:
  1. `deps` — `node:20-alpine`, `npm ci`
  2. `builder` — generates Prisma Client, runs `next build` (outputs `standalone`)
  3. `runner` — `node:20-alpine`, non-root `nextjs:nodejs` user, copies only
     `.next/standalone`, `.next/static`, `public`, `src/generated`, `prisma/schema.prisma`
- **`.dockerignore`** — excludes `node_modules`, `.next`, `.env`, coverage, logs, `.git`.
  `prisma/migrations` intentionally kept so the container can run migrations.
- **`next.config.mjs`** — added `output: "standalone"` for Docker standalone bundle.
- **`package.json`** — added `docker:up`, `docker:down`, `docker:logs` scripts.

### Key decisions
- **Zod for env validation** rather than manual checks: single schema definition,
  typed output, clear per-field error messages — catches misconfiguration at startup.
- **ioredis over `redis` (node-redis)**: better TypeScript support out of the box,
  mature ecosystem, native pipeline/cluster/sentinel API; ships its own `.d.ts`.
- **pino** over winston/morgan: significantly faster (low-overhead JSON serialisation),
  purpose-built for structured production logging, pino-pretty gives clean dev output
  with zero config.
- **`.env.example` as Dockerfile build placeholder**: avoids baking secrets into the
  image while still satisfying Zod validation during `next build`.

### Verified
- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

- **Roadmap:** Phase 0 — 4/5.
- **Next:** Phase 0 item 5 — Root README polish, CI workflow (GitHub Actions: lint + typecheck + test + build on push/PR).

## 2026-06-11 — Phase 0: README rewrite, GitHub Actions CI workflow

- **README.md** — full portfolio-quality rewrite:
  - Lexicon table (Hub, Drop, Boost/Bury/Heat, Clout, Warden/Overseer, The Stream, Stash, Reply)
  - Feature Overview covering all planned platform capabilities
  - Tech Stack table with version and role for every dependency
  - Architecture Overview prose (App Router server components, Prisma singleton, Redis caching, S3 media, Zod env validation)
  - Getting Started walkthrough (prerequisites, clone, `.env`, `docker:up`, install, migrate, seed, dev)
  - Available Scripts table covering all 15 npm scripts
  - Project Status linking to ROADMAP.md and PROGRESS.md
- **`.github/workflows/ci.yml`** — GitHub Actions CI workflow:
  - Triggers on every `push` and `pull_request` to `main`
  - Steps: `checkout` → `setup-node@v4` (Node 20, npm cache) → `npm ci` → `prisma generate` → `lint` → `typecheck` → `test` → `build`
  - Build step passes dummy env vars so Zod validation passes without a live database
- **Roadmap:** Phase 0 — **5/5 (complete)**.
- **Next:** Phase 1 — Auth (Auth.js email/password + OAuth GitHub/Google, User model, public profile pages `u/<handle>`, account settings).

## 2026-06-11 — Phase 1 backend: Auth.js v5, rate limiting, register + avatar upload routes, middleware

### Installed
- `next-auth@beta` (5.0.0-beta.31) — Auth.js v5 for Next.js App Router
- `@auth/prisma-adapter` — links Auth.js to the Prisma DB (Account, Session, VerificationToken models)
- `bcryptjs` moved to production deps (was dev-only; needed at runtime for credential auth)

### Created / Modified

- **`src/lib/auth.ts`** — Main Auth.js v5 config:
  - Adapter: `@auth/prisma-adapter` with the Prisma 7 singleton from `src/lib/db.ts`
  - Session strategy: `"database"` — server-side sessions with httpOnly cookie, no JWT
  - Providers: Credentials (email + bcrypt), GitHub + Google conditionally loaded when
    env vars are present (non-breaking for local dev without OAuth apps configured)
  - Credentials `authorize`: Zod validates input, looks up user, bcrypt compares hash;
    logs warn on failure, info on success; never reveals whether email vs password was wrong
  - `session` callback: enriches session with `handle`, `role`, `clout` from a single DB
    lookup — client components get full PostUp context from `useSession()`
  - Exports `{ handlers, auth, signIn, signOut }` + convenience `getSession()` helper

- **`src/app/api/auth/[...nextauth]/route.ts`** — Auth.js route handler (GET + POST)

- **`src/lib/rate-limit.ts`** — Redis sliding-window rate limiter:
  - Lua script (atomic ZREMRANGEBYSCORE + ZCARD + ZADD + PEXPIRE) — no TOCTOU race
  - Returns `{ success, remaining, reset }` for Retry-After headers
  - `authLimiter(ip)`: 10 req / 15 min — for login + register endpoints
  - `uploadLimiter(userId)`: 5 req / min — for media upload endpoints

- **`src/app/api/auth/register/route.ts`** — POST /api/auth/register:
  - Zod validation: email format, password ≥ 8 chars, handle `/^[a-zA-Z0-9_]{3,20}$/`
  - `authLimiter` keyed on `x-forwarded-for` / `x-real-ip`
  - Parallel uniqueness checks for email + handle
  - bcrypt hash (12 rounds), User created with `displayName` defaulting to handle
  - Structured error responses: 400/422/409/429/500

- **`src/app/api/user/avatar/route.ts`** — POST /api/user/avatar:
  - Auth guard: 401 if no session
  - `uploadLimiter` keyed on `userId`
  - Validates MIME type (jpeg/png/gif/webp) and size (≤ 5 MB)
  - Saves to `public/avatars/<userId>-<timestamp>.<ext>`, updates `User.avatar` in DB
  - TODO(Phase 3): swap local write for S3/MinIO upload

- **`src/types/next-auth.d.ts`** — Extends `Session.user` with `handle: string`,
  `role: Role`, `clout: number` so all server components get typed PostUp-specific fields

- **`src/middleware.ts`** — Auth.js middleware:
  - Public allow-list: `/`, `/login`, `/register`, `/u/[handle]`, `/h/[slug]`, `/api/auth/*`
  - All other routes redirect unauthenticated requests to `/login?callbackUrl=<url>`
  - Matcher excludes `_next/static`, `_next/image`, `favicon.ico`, and static assets

- **`src/lib/env.ts`** — Added 4 optional OAuth fields: `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

- **`.env` + `.env.example`** — Added OAuth placeholder vars

### Verified
- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

- **Phase 1 — backend complete, frontend in progress.**
- **Roadmap:** Phase 1 backend ✓.
- **Next:** Phase 1 frontend — `/login`, `/register` pages, `useSession` integration, profile page `u/[handle]`.

## 2026-06-11 — Phase 1 frontend: login/register pages, profile page, account settings, session nav

### Created / Modified

- **`src/components/session-provider.tsx`** — `"use client"` wrapper around
  `next-auth/react` `SessionProvider`; added to root layout so `useSession` works
  in all client components without extra boilerplate at each call site.

- **`src/app/layout.tsx`** — wrapped layout children with `<SessionProvider>`.

- **`src/app/(auth)/layout.tsx`** — centered auth shell: full-height flex column,
  vertically centered card, PostUp logo/wordmark above the card.

- **`src/app/(auth)/login/page.tsx`** — `"use client"` login form:
  - Email + password fields with inline validation errors
  - Submits via `signIn("credentials", { email, password, redirectTo: "/" })`
  - "Continue with GitHub" + "Continue with Google" OAuth buttons
  - Reads `?error=` from `useSearchParams()` and maps Auth.js error codes to
    human-readable messages
  - Loading state on submit button; link to `/register`

- **`src/app/(auth)/register/page.tsx`** — `"use client"` register form:
  - Email, handle (with `u/` prefix gutter), password, confirm password fields
  - Client-side validation before submit
  - POSTs to `/api/auth/register`; maps 409/422/429 API errors to field-level
    messages; auto-calls `signIn("credentials", …)` on success
  - Link to `/login`

- **`src/components/user-nav.tsx`** — `"use client"` `UserNav` component:
  - Uses `useSession` to determine auth state
  - Unauthenticated: "Log in" + "Sign up" buttons
  - Authenticated: 32 px avatar circle (image or initials fallback), handle,
    chevron-gated dropdown with "View profile", "Settings", "Sign out" items
  - Dropdown: click-outside + Escape-key close; focus returns to trigger on Escape;
    full ARIA `role="menu"` / `role="menuitem"` semantics
  - Also exports `Avatar` (used by profile + settings pages)

- **`src/components/site-header.tsx`** — extracted auth-dependent part into
  `<UserNav />` (client); header itself stays importable as a server component.

- **`src/app/u/[handle]/page.tsx`** — server-component public profile page:
  - Fetches user by handle via Prisma; `notFound()` on miss
  - Shows 80 px avatar (image or initials), display name, @handle, bio, clout
    badge (🔥), joined date (Intl.DateTimeFormat)
  - "Drops" / "Replies" tab UI — empty states for both (Phase 3/5 will populate)
  - `generateMetadata` exports name + bio as page title + description

- **`src/app/settings/page.tsx`** — server component: auth-guards via `auth()`;
  redirects to `/login?callbackUrl=/settings` if no session; loads DB user,
  renders four sectioned cards:
  - Profile (display name, bio, read-only handle)
  - Avatar (current avatar + upload with progress bar)
  - Password (current → new → confirm)
  - Danger zone (Delete account — disabled, "Coming soon" tooltip)

- **`src/app/settings/profile-form.tsx`** — `"use client"` form: PATCH
  `/api/user/profile`; inline success/error feedback; bio char counter.

- **`src/app/settings/avatar-form.tsx`** — `"use client"` form: XHR upload to
  `/api/user/avatar` with `progress` events → animated progress bar; local
  `FileReader` preview before upload completes; resets preview on error.

- **`src/app/settings/password-form.tsx`** — `"use client"` form: POST
  `/api/user/password`; maps `WRONG_PASSWORD` to field-level error.

- **`src/app/api/user/profile/route.ts`** — PATCH: auth guard, Zod validation
  (`displayName` ≤ 50 chars, `bio` ≤ 300 chars / nullable), DB update, returns
  updated fields.

- **`src/app/api/user/password/route.ts`** — POST: auth guard, Zod validation
  (`newPassword` ≥ 8 chars), bcrypt verify current password (403 on mismatch),
  bcrypt hash (12 rounds) + DB update.

### Verified
- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

- **Phase 1 — COMPLETE.**
- **Next:** Phase 2 — Hubs (communities): Hub model, create-hub flow, membership,
  hub page, roles & authorization.

## 2026-06-11 — Phase 2 backend: Hub API routes, membership, Warden/Overseer authorization

### Created / Modified

- **`src/lib/auth-helpers.ts`** — Centralised auth/authorization helpers:
  - `requireAuth()`: returns `Session["user"]` or 401 NextResponse
  - `requireOverseer()`: wraps `requireAuth`; returns 403 if not OVERSEER
  - `requireWarden(hubId)`: wraps `requireAuth`; checks DB for WARDEN membership,
    returns 403 if not. Returns `Membership` record on success.
  - All helpers use a discriminated return (`T | NextResponse`) so callers do a
    single `instanceof NextResponse` check — keeps route handlers clean.

- **`src/app/api/hubs/route.ts`** — Hub collection:
  - `POST`: Zod validates name (`/^[a-z0-9_]{1,30}$/`), description (≤500), rules
    (optional, ≤2000), nsfw (bool, default false). Slug = name. Checks slug
    uniqueness (409 if taken). Creates Hub + WARDEN Membership in a single
    transaction. Rate-limited: 3 creations/day per user. Returns 201 + hub.
  - `GET`: Lists hubs with search (`q`), sort (`new` | `popular`), cursor
    pagination, limit 1–50 (default 20). Includes `_count.memberships`. Results
    cached in Redis for 60 seconds keyed on full query string.

- **`src/app/api/hubs/[slug]/route.ts`** — Hub detail:
  - `GET`: Returns hub with `_count.memberships`, `_count.drops`, creator handle.
    If caller is authenticated also returns their `Membership` record. Redis cache
    30s per (slug, userId) pair.
  - `PATCH`: WARDEN or OVERSEER only. Zod validates description, rules, nsfw,
    icon (URL), banner (URL). Invalidates all cached keys for the hub on update.
  - `DELETE`: OVERSEER only. Cascade via Prisma `onDelete: Cascade`. Returns 204.

- **`src/app/api/hubs/[slug]/membership/route.ts`** — Hub join/leave:
  - `POST`: Auth required; 400 if already a member. Creates MEMBER Membership. 201.
  - `DELETE`: Auth required; 400 if not a member. WARDEN blocked from leaving if
    they are the sole Warden (returns 400 SOLE_WARDEN). Returns 204.

- **`src/app/api/hubs/[slug]/members/route.ts`** — Member list:
  - `GET`: Paginated (max 50). Optional `role` filter. Returns handle, avatar,
    clout, role, joinedAt per member.

- **`src/app/api/hubs/[slug]/wardens/route.ts`** — Warden management:
  - `POST`: Promote member to WARDEN. OVERSEER or existing WARDEN only. Target
    must already be a member. 400 if already WARDEN.
  - `DELETE`: Demote WARDEN to MEMBER. OVERSEER or existing WARDEN only. Cannot
    demote the hub creator (checks `Hub.createdById`). 400 if not a WARDEN.

- **`src/app/api/hubs/[slug]/icon/route.ts`** — Hub icon upload:
  - `POST`: WARDEN or OVERSEER only. Accepts jpeg/png/webp, max 2 MB. Saves to
    `public/hubs/<slug>-icon.<ext>`. Updates `Hub.icon`. Uses `uploadLimiter`.
    TODO(Phase 3): swap to S3/MinIO.

- **`src/app/api/hubs/[slug]/banner/route.ts`** — Hub banner upload:
  - `POST`: WARDEN or OVERSEER only. Accepts jpeg/png/webp, max 5 MB. Saves to
    `public/hubs/<slug>-banner.<ext>`. Updates `Hub.banner`. Uses `uploadLimiter`.
    TODO(Phase 3): swap to S3/MinIO.

- **`src/middleware.ts`** — Added `/api/hubs` and `/api/hubs/[slug]` to the
  public allow-list so GET hub discovery and hub detail are accessible without
  authentication. Mutating methods (POST/PATCH/DELETE) are still protected at the
  route-handler level.

### Key decisions
- **`requireWarden` returns the full Membership record** (not just a boolean) so
  callers can use it for further checks without a second DB query.
- **Redis cache per (slug, userId)** for hub detail: authenticated callers get
  their membership inline; anonymous callers share a public cache entry.
- **Cursor pagination throughout** — avoids `OFFSET` scans on large member/hub
  lists; the cursor is always the last record's primary key.
- **Sole-warden guard on leave** prevents hubs from ending up unmoderated.
- **Creator-demotion guard on warden DELETE** prevents the founding member from
  losing their guaranteed warden status.

### Verified
- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

- **Phase 2 — backend complete, frontend in progress.**
- **Next:** Phase 2 frontend — hub page `/h/[slug]`, create-hub flow, join/leave button, member list.

---

## 2026-06-14 — Phase 3 frontend: Drop cards, feed, create/detail/edit pages, markdown editor, media

### Created / Modified

- **`src/types/drop.ts`** — Shared `Drop`, `DropAuthor`, `DropHub`, `DropCount`, `LinkPreviewData` interfaces matching the API `dropInclude` shape.

- **`src/components/drops/drop-card.tsx`** — Reusable drop card:
  - Left vote column (Heat score + Boost/Bury arrows — disabled with "Coming in Phase 4" tooltip)
  - Top bar: hub icon + link · author · relative timestamp
  - Content preview by type: TEXT (300-char truncation), IMAGE (thumbnail), VIDEO (placeholder + play icon), LINK (preview card with domain/title/description/og:image)
  - NSFW overlay with click-to-reveal
  - Footer: reply count, Share (clipboard), Edit (author + TEXT only), Delete (author/OVERSEER)

- **`src/components/drops/drop-feed.tsx`** — Client feed with:
  - Sort tabs: Hot · Rising · Fresh · Top
  - Infinite scroll via IntersectionObserver on sentinel div
  - Loading skeleton (3 placeholder cards), empty state, error state

- **`src/components/drops/delete-drop-button.tsx`** — Client delete button with confirmation + redirect.

- **`src/app/h/[slug]/page.tsx`** — Replaced drop feed placeholder with `<DropFeed hubSlug={hub.slug} />`.

- **`src/app/h/[slug]/submit/page.tsx`** — Server page: requires auth + hub membership, redirects otherwise.

- **`src/app/h/[slug]/submit/create-drop-form.tsx`** — Client form:
  - Type selector tabs (Text · Image · Video · Link)
  - Title field with 300-char counter
  - TEXT: `@uiw/react-md-editor` (dynamic import, SSR disabled), live preview
  - IMAGE/VIDEO: drag-and-drop upload zone with XHR progress bar → `/api/media/image` / `/api/media/video`
  - LINK: URL input with blur/paste live preview via `/api/link-preview`
  - Field errors inline, rate-limit error as toast

- **`src/app/drops/[id]/page.tsx`** — Drop detail server page:
  - Breadcrumb h/slug → title
  - Full content by type: TEXT (server-side `renderMarkdown` → `dangerouslySetInnerHTML`), IMAGE (`<Image unoptimized>`), VIDEO (`<video controls>`), LINK (oEmbed if YouTube/Vimeo/Twitter else link preview card)
  - Edit button (author + TEXT), Delete button (author/WARDEN/OVERSEER)
  - Replies Phase 5 placeholder
  - `generateMetadata`: title + 150-char body/preview description

- **`src/app/drops/[id]/edit/page.tsx`** — Server page: requires auth + author, TEXT only.

- **`src/app/drops/[id]/edit/edit-drop-form.tsx`** — Pre-filled title + MDEditor, PATCH `/api/drops/[id]`, redirect on success.

- **`src/app/page.tsx`** — Home page: authenticated users see The Stream (`<DropFeed />`); unauthenticated users see hero + feature grid + Recent Drops feed.

- **`src/components/site-header.tsx`** — Added "+ Create" button (links to `/hubs` with tooltip "Pick a hub to post in").

### Packages added

- `@uiw/react-md-editor` — markdown editor (dynamically imported, SSR disabled)
- `react-markdown`, `remark-gfm`, `rehype-raw` — client-side markdown rendering

### Verification

- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

**Phase 3 complete.**
**Next:** Phase 4 — Voting & Ranking (Boost/Bury on drops + replies, Heat score, Hot/Rising algorithms, The Stream home feed, Clout, Redis vote tallies).
