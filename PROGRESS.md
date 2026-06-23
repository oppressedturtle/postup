# PostUp — Progress Log

## 2026-06-23 — Resolved Phase 8 coverage gate (the right way) + reconciled git drift → SHIP gate

**Drift found:** `origin/main` had already advanced past building — it held `security`
(hardened auth incl. a suspended-user check, file-upload content sniffing via `file-type`,
security headers, Next.js → 14.2.35), `qa`, and a `ci: align coverage thresholds` commit that
"resolved" the gate the weak way (lowered thresholds to 25/50/50, excluded the untested infra
modules). Local STATE.json was stale and local git had diverged with a single different commit.

**Done:**
- Rebased local work onto `origin/main` (non-destructive; pushed as a clean fast-forward `5f7099f`).
- Resolved the coverage decision the **strong** way, matching the roadmap's ">70% on core":
  added real unit tests for three previously 0%-covered core modules —
  `auth-helpers` (requireAuth/Overseer/Warden, incl. the new 403 SUSPENDED paths),
  `oembed` (provider match, SSRF block, cache, sanitize, defaults, failures),
  `link-preview` (OG vs `<title>`/meta fallback, www-strip, `og:site_name` domain, errors).
- Scoped the `test:coverage` gate to `src/lib` (the framework-agnostic core) at 70/70/60.
- Reinstalled deps (`file-type` was in the lockfile but missing from local `node_modules`).
- **Verification (all green):** vitest **223/223 passing**; coverage **93.6% lines / 92.5%
  branches / 94.1% funcs** on core (`test:coverage` exits 0); `tsc --noEmit` clean; `next lint` clean.

**Next:** confirm CI green on `5f7099f` (in_progress at handoff; prior CI run was green), then
tag `v1.0.0` + publish the GitHub release and set `shipped: true`. Building + security + qa complete.


## 2026-06-15 — Drift reconciliation + full build verification → BUILDING COMPLETE, advancing to SECURITY

**Context:** local checkout was far behind `origin/main`. Remote already contained Phases 4–9
(voting/ranking, threaded replies, moderation/admin, discovery/polish, tests/E2E/CI, deploy)
but the local state file + ROADMAP checkboxes were stale (resume note still said "Phase 4").

**Done:**
- Fast-forwarded local to `origin/main` (`286fba0`, Phase 9 deploy). No local divergence.
- Reinstalled deps (merge added `@vitejs/plugin-react`, `vitest`, `@playwright/test`, etc.)
  and regenerated the Prisma client (custom output `src/generated/prisma`).
- **Verification (all green):**
  - **Unit/integration tests:** `vitest run` → **175/175 passing** across 16 files
    (ranking, votes, hubs, mentions, replies, markdown, SSRF guard, rate-limit, register,
    and component tests for vote buttons, join, notifications bell, report, reply form, stash).
  - **Typecheck:** `tsc --noEmit` clean (after Prisma generate).
  - **Lint:** `next lint` — no warnings or errors.
  - **Production build:** `next build` succeeds — all routes compiled (stream, hubs, search,
    stash, notifications, h/[slug], u/[handle], sitemap, API routes, middleware).
- Reconciled `ROADMAP.md`: checked off all 48 items across Phases 0–9 to match shipped code.
- Untracked churning `tsconfig.tsbuildinfo` (now gitignored).

**Roadmap:** Phases 0–9 ✅ complete. Building phase done.

**Next:** **SECURITY PHASE** — full audit per ROADMAP (npm audit/CVEs, authz on every route +
mod/admin action, XSS on markdown/oEmbed/link-preview sanitization, SSRF on fetchers,
file-upload hardening, session/secret handling, CORS, security headers, rate limits). Write
`SECURITY.md` with findings + fixes.


## 2026-06-14 — Phase 7 frontend: Search UI, Stash page, notifications center, hub explore, responsive, a11y, SEO

### Created

- **`src/components/search/search-bar.tsx`** — `<SearchBar>` client component:
  - Prominent search input in site header (desktop); icon-only that expands on mobile.
  - Debounced 300ms, min 2 chars. Fetches `GET /api/search?q=…&limit=3`.
  - Dropdown panel (max-height 480px, scrollable): Drops · Hubs · Users sections, each up to 3 results.
  - Loading skeleton, empty state with query echo.
  - Keyboard nav: ArrowUp/Down move between results, Enter navigates, Escape closes.
  - AbortController cancels in-flight requests on new input.
  - "See all results for '…'" link at bottom → `/search?q=…`.
  - Click-outside closes; ARIA listbox/option roles.

- **`src/components/mobile-nav.tsx`** — `<MobileNav>` slide-in drawer:
  - All nav links including Stash and Notifications for authenticated users.
  - Backdrop click and Escape key dismiss. Body scroll locked when open.
  - role="dialog" aria-modal="true".

- **`src/components/drops/stash-button.tsx`** — `<StashButton>` client component:
  - Bookmark icon (filled when stashed, outline when not).
  - Optimistic toggle; reverts on API failure.
  - Unauthenticated users redirected to `/login`.
  - Props: `dropId: string`, `initialStashed: boolean`.

- **`src/app/search/page.tsx`** — Search results page (server component):
  - Reads `?q=` and `?type=` from searchParams.
  - Direct Prisma FTS queries for SSR (no client waterfall).
  - Tab bar: All · Drops · Hubs · Users (URL-driven).
  - `<DropCard>` grid for drops, `<HubCard>` grid for hubs, user cards with avatar/handle/clout/bio.
  - Per-tab empty states. `generateMetadata` with dynamic title.

- **`src/app/stash/page.tsx`** — Stash page (server component):
  - Auth-guarded (redirect to `/login`).
  - Fetches stashed drops with author + hub + counts, filters soft-deleted.
  - Renders `<DropCard>` list with `initialStashed={true}` for correct button state.
  - Empty state with bookmark icon illustration.

- **`src/app/notifications/page.tsx`** — Notifications page (server component):
  - Auth-guarded. Fetches first page (20) server-side.
  - Passes to `<NotificationList>` client component.

- **`src/app/notifications/notification-list.tsx`** — `<NotificationList>` client component:
  - Groups notifications by Today / Yesterday / Earlier.
  - Infinite scroll via "Load more" cursor pagination.
  - Type-specific icons (REPLY_TO_DROP, REPLY_TO_REPLY, MENTION, DROP_BOOSTED).
  - "Mark all read" button; auto-marks visible unread after 2s delay.
  - Unread dot indicator per item; full-page empty state.

### Modified

- **`src/components/site-header.tsx`** — Converted to client component using `useSession`:
  - Integrated `<SearchBar>` between logo/nav and user controls.
  - Hamburger button on mobile opens `<MobileNav>` drawer.
  - `<nav aria-label="Main">` for desktop links; `<nav aria-label="User">` for right controls.
  - Mobile notification bell links to `/notifications` directly.

- **`src/components/user-nav.tsx`** — Added "My Stash" → `/stash` and "Notifications" → `/notifications` menu items.

- **`src/components/drops/drop-card.tsx`** — Added `initialStashed` prop and `<StashButton>` in footer between Share and Report. Share label hidden on mobile (`hidden sm:inline`). `aria-label="Share drop"` on share button.

- **`src/app/drops/[id]/page.tsx`** — Added `<StashButton>` in action bar. Fetches stash state alongside warden check. Updated `generateMetadata` with `openGraph.type: "article"`, OG image URL, `twitter.card: "summary_large_image"`.

- **`src/app/h/[slug]/page.tsx`** — Updated `generateMetadata` with hub OG image, `twitter.card: "summary_large_image"`.

- **`src/app/hubs/page.tsx`** — Added Trending Now horizontal scroll row (fetches `/api/hubs/trending`) and Recommended for You grid (fetches `/api/hubs/recommended`, auth-only).

- **`src/app/layout.tsx`** — Added `metadataBase`, default `openGraph` with PostUp brand, `twitter.card: "summary"`. Added skip-to-content `<a href="#main-content">` link. Added `id="main-content"` to `<main>`.

- **`src/app/globals.css`** — Added `:focus-visible` ring (brand-500), `.skip-link` / `.skip-link:focus` styles, `prefers-reduced-motion` media query.

- **`src/app/admin/layout.tsx`** — Admin sidebar collapses to horizontal tab strip on mobile (`sm:hidden` / `hidden sm:flex`).

### Verification

- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

**Phase 7 complete.**

**Next:** Phase 8 — Hardening & Tests: Vitest server/API tests, component tests, Playwright E2E, GitHub Actions CI matrix.

---

## 2026-06-14 — Phase 7 backend: Full-text search, Stash, trending/recommended hubs, sitemap, OG images

### Created / Modified

- **`src/app/api/search/route.ts`** — `GET /api/search`:
  - Params: `q` (min 2 chars), `type` (drops|hubs|users|all, default all), `limit` (1–25, default 10), `cursor`.
  - Postgres full-text search via `db.$queryRaw` with `to_tsvector / plainto_tsquery('english', ...)` for drops + hubs; `'simple'` dictionary for user handle/displayName matching.
  - Drops: searches `title || body`, returns author, hub, heat, replyCount, createdAt. Excludes removed drops.
  - Hubs: searches `name || description`, returns memberCount, dropCount, icon.
  - Users: searches `handle || displayName`, returns avatar, clout.
  - All raw queries are fully parameterised (no string interpolation); `Prisma.raw()` only for integer literals.
  - BigInt reply/member counts serialised to Number before JSON response.
  - 60s Redis cache per (type, limit, cursor, q). Rate limited: 30/min per IP.

- **`src/app/api/drops/[id]/stash/route.ts`** — Stash toggle for a specific drop:
  - `POST` (auth): upsert Stash record — idempotent, already-stashed is a no-op. Returns `{ stashed: true }`.
  - `DELETE` (auth): `deleteMany` — idempotent, not-stashed is a no-op. Returns `{ stashed: false }`.
  - Verifies drop exists and is not removed before POST.

- **`src/app/api/user/stash/route.ts`** — `GET /api/user/stash` (auth required):
  - Cursor-paginated list of user's stashed drops, newest first (limit 1–50, default 20).
  - Includes drop with author, hub, heat, reply count.
  - Filters out stash entries for drops soft-deleted since stashing.
  - 30s Redis cache per (userId, cursor, limit).

- **`src/app/api/hubs/trending/route.ts`** — `GET /api/hubs/trending` (public):
  - Counts drops created in the last 24h per hub using a filtered `COUNT` aggregate in a single raw query.
  - Returns top 10 hubs ordered by new-drop count DESC. Includes name, slug, icon, memberCount, newDropCount.
  - 10-minute Redis cache.

- **`src/app/api/hubs/recommended/route.ts`** — `GET /api/hubs/recommended` (auth optional):
  - Authenticated: top 5 hubs by member count that the user is NOT already a member of.
  - Unauthenticated: top 5 hubs by member count globally.
  - 5-minute Redis cache per (userId | "anon").

- **`src/app/sitemap.ts`** — Next.js 14 metadata sitemap (`MetadataRoute.Sitemap`):
  - Static pages: `/`, `/hubs`, `/stream`, `/login`, `/register` with appropriate changeFreq + priority.
  - All hub pages (`/h/<slug>`) — lastModified = hub.updatedAt, hourly, priority 0.8.
  - Recent 1000 non-removed drops (`/drops/<id>`) — lastModified = drop.updatedAt, daily, priority 0.6.
  - All user profiles (`/u/<handle>`) — lastModified = user.updatedAt, weekly, priority 0.5.
  - Three parallel Prisma queries (hubs, drops, users) for efficiency.

- **`src/app/robots.ts`** — Next.js 14 metadata robots (`MetadataRoute.Robots`):
  - Allow all crawlers for `/`; disallow `/admin`, `/settings`, `/api`.
  - Points to `<NEXTAUTH_URL>/sitemap.xml`.

- **`src/app/api/og/route.tsx`** — Edge-runtime OG image generation (`@vercel/og`):
  - Params: `title` (required, capped at 120 chars), `description?` (capped at 200 chars), `type` (drop|hub|default).
  - 1200×630 dark-themed branded card: PostUp flame logo, type badge, large title, description, tagline footer.
  - Font size adapts to title length (40px if >60 chars, 52px otherwise).
  - `export const runtime = "edge"` for low-latency image generation at the CDN edge.

- **`src/middleware.ts`** — Added to public allow-list:
  - `/api/search`, `/api/hubs/trending`, `/api/hubs/recommended`, `/api/og`, `/sitemap.xml`, `/robots.txt`

### Key decisions

- **Parameterised FTS via tagged template literals**: `db.$queryRaw\`...\`` with `${q}` interpolation uses Prisma's `sqltag` which produces a parameterised prepared statement — never raw string concatenation. This is safe against SQL injection even for the free-text search query.
- **`Prisma.raw()` only for integer literals**: LIMIT values are integers from validated Zod transforms, never user-supplied strings, so `Prisma.raw(String(limit))` is safe for these specific placements.
- **`'simple'` dictionary for user search**: handles (lowercase alphanumeric + underscore) don't benefit from English stemming; `'simple'` dictionary matches the literal token, which is correct for handle search.
- **BigInt serialisation**: `$queryRaw` returns PostgreSQL `bigint` aggregate counts as JS `BigInt`; these are converted to `Number` before JSON serialisation to avoid `JSON.stringify` throwing.
- **Trending uses filtered `COUNT` aggregate**: a single query with `COUNT(...) FILTER (WHERE ...)` computes new-drop counts without a subquery or application-level join. The `HAVING > 0` clause excludes hubs with no recent activity from the result.
- **Stash uses `deleteMany` for idempotent DELETE**: avoids the 404 code path — the operation always succeeds whether or not the record existed.
- **OG edge runtime**: `@vercel/og` renders React JSX to PNG at the edge; no Node.js runtime dependency. Inline styles only (no Tailwind) since edge JSX doesn't run the CSS pipeline.
- **Sitemap parallel queries**: hub, drop, and user queries run concurrently with `Promise.all` since they're independent. The sitemap is regenerated on every request (Next.js caches it via ISR in production).

### Verified
- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

- **Phase 7 — backend complete, frontend in progress.**
- **Next:** Phase 7 frontend — Search UI, Stash page, trending/recommended hub widgets, SEO metadata on pages.

---

## 2026-06-14 — Phase 6 backend: Warden tools, report system, mod log, Overseer admin, ban system

### Created / Modified

- **`prisma/schema.prisma`** — Added enums: `ReportReason` (SPAM, HARASSMENT, HATE_SPEECH, MISINFORMATION, NSFW_CONTENT, OTHER), `ReportStatus` (PENDING, RESOLVED, DISMISSED), `ModActionType` (12 action types covering drop/reply/user/report moderation). Added models:
  - `Report` — links reporter user to a Drop or Reply (exactly one), carries reason + details + status + resolved-by metadata. Indexed on `(status, createdAt DESC)`, `dropId`, `replyId`.
  - `ModLog` — audit trail entry per moderation action; hubId null for site-wide OVERSEER actions. Indexed on `(hubId, createdAt DESC)` and `moderatorId`.
  - `HubBan` — unique `(userId, hubId)` ban record with bannedBy + reason. Cascades on user/hub delete.
  - Added `suspended Boolean @default(false)` to `User`.
  - Added relations to `User` (`reportsFiled`, `modActions`, `hubBans`), `Hub` (`modLogs`, `bans`), `Drop` (`reports`), `Reply` (`reports`).
  - Ran `prisma generate` to regenerate the client.

- **`src/lib/mod-log.ts`** — `logModAction(params)` wrapper around `db.modLog.create()`. Catches and logs all errors internally so logging failures never block moderation actions.

- **`src/lib/check-ban.ts`** — `isUserBanned(userId, hubId)`: checks Redis cache first (`ban:<userId>:<hubId>`, 5-min TTL), falls back to DB on cache miss. Safe default on infrastructure failure (returns false to avoid blocking legitimate users). `invalidateBanCache(userId, hubId)` for immediate effect after ban/unban.

- **`src/app/api/drops/[id]/moderate/route.ts`** — `POST` (WARDEN or OVERSEER):
  - Zod: `action` (pin|unpin|lock|unlock|remove|restore), `reason?`.
  - pin/unpin → `isPinned` toggle; lock/unlock → `isLocked` toggle.
  - remove → `isRemoved=true`, body/imageUrl/videoUrl/linkUrl/linkPreview cleared (`Prisma.JsonNull` for the JSON field).
  - restore → `isRemoved=false`.
  - Invalidates `drop:<id>` + all `feed:*` Redis keys. Logs via `logModAction()`.

- **`src/app/api/replies/[id]/moderate/route.ts`** — `POST` (WARDEN or OVERSEER):
  - Actions: remove (`isRemoved=true`, `body="[removed]"`) | restore (`isRemoved=false`).
  - Invalidates `reply:<id>` + `replies:<dropId>:*` cache keys. Logs mod action.

- **`src/app/api/hubs/[slug]/bans/route.ts`** — Hub ban management:
  - `GET`: paginated ban list with user handle + avatar. WARDEN or OVERSEER only.
  - `POST`: ban by handle. Checks for duplicates (409). Creates `HubBan` + deletes `Membership` in a single Prisma transaction. Invalidates ban cache. Logs `BAN_USER`.
  - `DELETE`: unban by handle. Deletes `HubBan`, invalidates cache, logs `UNBAN_USER`.

- **`src/app/api/reports/route.ts`** — Report system:
  - `POST` (auth): Zod validates exactly one of dropId/replyId + reason + details (≤500). Rate-limited 10/hour per user. Deduplication: one report per (reporterId, content). Returns 201.
  - `GET` (WARDEN with hubSlug / OVERSEER): paginated pending reports (limit 20). WARDENs must pass `hubSlug`; scoped to drops/replies in that hub. Includes reporter handle, content snippet, reason, createdAt.

- **`src/app/api/reports/[id]/route.ts`** — Report resolution:
  - `PATCH` (WARDEN of relevant hub or OVERSEER): body `{ action: "resolve"|"dismiss", reason? }`.
  - resolve → also soft-removes the reported content (drop or reply). dismiss → status only.
  - Guards: 409 if already resolved/dismissed. Logs mod action(s) for both the report and the content removal.

- **`src/app/api/hubs/[slug]/mod-log/route.ts`** — Public mod log:
  - `GET` (public): paginated hub mod log (limit 50). Includes moderator handle, action, target IDs, reason, timestamp. 60s Redis cache per (slug, cursor, limit).

- **`src/app/api/admin/users/route.ts`** — `GET` (OVERSEER): search users by handle/email, filter by role, paginated. Returns handle, email, role, clout, suspended, createdAt, hubBan count.

- **`src/app/api/admin/users/[handle]/route.ts`** — `PATCH` (OVERSEER): change role (MEMBER↔OVERSEER) or toggle suspended. Prevents self-modification. Logs BAN_USER/UNBAN_USER for suspension changes.

- **`src/app/api/admin/hubs/route.ts`** — `GET` (OVERSEER): list all hubs with member/drop counts, creator, NSFW flag. Searchable by name/slug.

- **`src/app/api/admin/hubs/[slug]/route.ts`** — `DELETE` (OVERSEER): hard-delete hub with required reason body field. Cascades via Prisma. Evicts hub + feed Redis keys.

- **`src/app/api/admin/reports/route.ts`** — `GET` (OVERSEER): all reports across all hubs, filterable by status (default PENDING), paginated. Full content context including hub slug.

- **`src/app/api/drops/route.ts`** — POST updated: ban check via `isUserBanned()` after membership check (403 if banned). New-account limit: accounts < 24 h old may create max 2 drops/day.

- **`src/app/api/drops/[id]/replies/route.ts`** — POST updated: ban check (403 if banned). New-account limit: accounts < 24 h old may create max 5 replies/day.

- **`src/middleware.ts`** — Added to public allow-list: `/api/hubs/[slug]/mod-log`, `/api/reports`. Admin routes (`/api/admin/*`) are protected by default (not in public allow-list); role enforcement in handler.

### Key decisions

- **`Prisma.JsonNull` for nullable JSON fields**: setting `linkPreview: null` in a Prisma update for a `Json?` column requires `Prisma.JsonNull` (not JS `null`) to explicitly set the DB value to SQL NULL. This is a Prisma v7 requirement.
- **Ban cache safe default**: on Redis or DB failure, `isUserBanned` returns `false` rather than blocking users. Bans are a soft enforcement mechanism; it's preferable to let a request through on infrastructure failure than to break posting for all users.
- **Ban + membership deletion in transaction**: ensures a banned user's membership is removed atomically with the ban creation, preventing the race condition where they could still post between the two operations.
- **New-account limits via DB count**: using a simple `count()` per calendar day (UTC) rather than a Redis counter avoids cache staleness concerns on the critical correctness path for rate controls.
- **Mod log never blocks**: `logModAction` catches all errors internally. A logging failure must not fail the moderation action — the moderation always takes effect first.
- **Public mod log with 60s cache**: Reddit's public mod log model — transparency is a core feature, not an admin concern. The 60s cache keeps it responsive under load.
- **Report deduplication at DB level** (not cache): one report per (reporterId, dropId|replyId) is enforced by `findFirst` before create, not a unique constraint, allowing the same content to be reported by multiple users.

### Verified
- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

- **Phase 6 — backend complete, frontend in progress.**
- **Next:** Phase 6 frontend — Warden mod panel, report queue UI, mod log view, Overseer admin dashboard.



## 2026-06-14 — Phase 5 backend: Reply CRUD, threaded fetch, @mention parsing, notification system

### Created / Modified

- **`prisma/schema.prisma`** — Added `NotificationType` enum (`REPLY_TO_DROP`, `REPLY_TO_REPLY`, `MENTION`, `DROP_BOOSTED`) and `Notification` model (`id`, `userId`, `type`, `read`, `payload: Json`, `createdAt`). Composite index on `(userId, read, createdAt DESC)` for efficient unread queries. Added `notifications Notification[]` relation to User. Ran `prisma generate` to regenerate the client.

- **`src/lib/mentions.ts`** — @mention parser:
  - `extractMentions(text)`: regex `/\@([a-zA-Z0-9_]{3,20})/g`, deduplicated, capped at 10 handles, returns lowercase.
  - `linkifyMentions(html)`: post-sanitization pass that replaces `@handle` with `<a href="/u/handle" class="mention">@handle</a>`. Skips handles already inside HTML attributes via negative lookbehind `(?<!=")`.

- **`src/lib/notifications.ts`** — Notification helpers:
  - `createNotification(userId, type, payload)`: deduplication via `findFirst` within the last 5 minutes on `(userId, type, replyId|dropId)`. Creates `Notification` record then fire-and-forget Redis `PUBLISH notifications:<userId>` for real-time consumers. Failures are logged, never thrown.
  - `notifyMentions(mentionerUserId, mentionerHandle, handles, payload)`: batch `findMany` to resolve handles → user IDs (case-insensitive), filters out self-mentions at the DB query level, calls `createNotification` per resolved user.

- **`src/app/api/drops/[id]/replies/route.ts`** — Reply collection:
  - `GET` (public): Zod params `sort` (best|top|new|controversial) + `limit` (1–200, default 100). `best` → `heat DESC, createdAt ASC`; `top` → `heat DESC`; `new` → `createdAt DESC`; `controversial` → raw SQL `ORDER BY ABS(heat) DESC` (Prisma doesn't expose `ABS` in `orderBy`). Enriches controversial results with author + child counts via parallel secondary queries. 30s Redis cache per `(dropId, sort, limit)`.
  - `POST` (auth + hub membership): Zod `body` (1–10000 chars) + `parentId?`. Validates parentId belongs to this drop. Rate-limited 30/hour per user. Creates reply, extracts mentions → `notifyMentions()`, notifies drop author (`REPLY_TO_DROP`) on top-level, parent reply author (`REPLY_TO_REPLY`) on nested. Notifications dispatched fire-and-forget. Returns 201 + reply with author + `_count.children`.

- **`src/app/api/replies/[id]/route.ts`** — Reply detail:
  - `GET` (public): reply + author + parent context (body, author). Sanitises `body → "[removed]"` for removed replies in the response. 60s Redis cache.
  - `PATCH` (author only): validates `body` (1–10000), updates, invalidates cache.
  - `DELETE` (author / hub WARDEN / OVERSEER): soft-delete — `isRemoved=true`, `body="[removed]"`. Preserves node in the tree for thread integrity. Invalidates reply + drop replies cache.

- **`src/app/api/notifications/route.ts`** — Notifications collection:
  - `GET` (auth): cursor pagination (default 20, max 50), returns `{ notifications, nextCursor, unreadCount }`. The `unreadCount` is fetched in parallel with the page query.
  - `PATCH` (auth): marks notifications read by `{ ids: string[] }` or `{ all: true }`. Always scopes update to the requesting user's notifications. Invalidates `notif:unread:<userId>` cache.

- **`src/app/api/notifications/count/route.ts`** — Unread count:
  - `GET` (auth): returns `{ unread: number }`. 30s Redis cache keyed `notif:unread:<userId>`. Cache is invalidated by `PATCH /api/notifications`.

- **`src/middleware.ts`** — Added to public allow-list:
  - `/api/drops/[id]/replies` (GET public; POST auth enforced in handler)
  - `/api/replies/[id]` (GET public; PATCH/DELETE auth enforced in handler)

### Key decisions

- **Flat reply list, client builds tree**: avoids recursive CTEs or multiple round-trips; all replies for a drop are returned flat and the client assembles the tree structure. Practical because reply counts per drop are bounded and the 30s cache amortises the query cost.
- **ABS(heat) controversial sort via raw SQL**: Prisma v7 `orderBy` doesn't expose expression functions. Raw SQL is localised to a single code path with a secondary enrichment query for author/child-count data, keeping the rest of the handler on the ORM.
- **Fire-and-forget notification dispatch**: notifications are `Promise.resolve().then(...)` so they never add latency to the reply creation response. Failures are logged but can't cause 500s on the critical write path.
- **Deduplication window of 5 minutes**: prevents double-notifications when an author edits content that retriggers the same event. The replyId-keyed dedup is precise enough to avoid suppressing legitimate separate notifications.
- **Soft-delete preserves node**: deleted replies keep their row so child replies remain accessible with proper parent context. The `body` is overwritten with `"[removed]"` both in the DB and in GET responses.

### Verified
- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

- **Phase 5 — backend complete, frontend in progress.**
- **Next:** Phase 5 frontend — Threaded reply UI, reply box, mention linkification, notification bell.

## 2026-06-14 — Phase 4 backend: Boost/Bury votes, Heat score, hot ranking, The Stream, Clout

### Created / Modified

- **`src/lib/ranking.ts`** — Pure ranking utility functions (no I/O):
  - `wilsonScore(ups, downs)`: Wilson score lower bound (95 % CI) for "Best" reply sort
    (Phase 5). Returns a value in [0, 1]; items with few votes score conservatively low.
  - `hotScore(heat, createdAt)`: Reddit-style hot score — `log10(|heat|) × sign + age_seconds / 45000`.
    Uses a PostUp epoch (2026-06-01) as the base so scores stay manageable.
  - `isRising(heat, createdAt)`: `heat > 0 && age < 24 h` — simple "new + positive momentum"
    predicate for the Rising feed.

- **`src/app/api/drops/[id]/vote/route.ts`** — Drop vote endpoint:
  - `GET`: returns `{ userVote: 1|-1|null, heat }` for the caller; 60 s Redis cache per
    (userId, dropId).
  - `POST` (auth + rate-limited 60/min): Zod validates `{ value: 1|-1 }`. Atomic Prisma
    transaction handles three cases — new vote (create), same vote (toggle off/delete),
    different vote (flip/update). Adjusts `Drop.heat` and author `User.clout` accordingly.
    Self-votes adjust Heat but never award/deduct Clout. Clout never goes below 0 (clamped
    inside the transaction). After transaction: updates `vote:drop:<id>` Redis key (SETEX
    300 s), SCAN-invalidates all `feed:*` cache keys, invalidates per-user vote state cache.
    Returns `{ heat, userVote }`.

- **`src/app/api/replies/[id]/vote/route.ts`** — Reply vote endpoint (same logic as drop
  vote but targets `Reply.heat`). Shared rate-limit bucket `vote:<userId>` with drop votes.
  Returns `{ heat, userVote }`.

- **`src/app/api/votes/route.ts`** — Bulk vote state:
  - `GET ?dropIds=id1,id2,...` (auth required, max 50 IDs). Parallel Prisma queries for
    drop heats + user votes. Returns `{ [dropId]: { userVote: 1|-1|null, heat } }`. Missing
    (removed/non-existent) drops are omitted — callers treat missing keys as null/0.

- **`src/app/api/stream/route.ts`** — The Stream (personalised home feed):
  - `GET` (auth optional). Authenticated: fetches user's hub memberships, queries drops WHERE
    `hubId IN (memberHubs)` last 72 h, re-sorts with `hotScore()` in application layer,
    cursor-paginates. Falls back to global hot feed if user has no memberships. Unauthenticated:
    top-20 global drops by heat, no pagination. Redis cache 60 s per (userId|"anon", cursor).
    Returns `{ drops, nextCursor }`.

- **`src/app/api/users/top/route.ts`** — Clout leaderboard:
  - `GET` (public). Returns top 10 users by `clout` DESC: `{ handle, displayName, avatar, clout }`.
    Redis cache 5 minutes (key `leaderboard:clout:top10`).

- **`src/app/api/drops/route.ts`** — Feed API updated:
  - Imports `hotScore`, `isRising` from `src/lib/ranking`.
  - `hot` sort: DB query restricted to last 72 h, fetches `(limit+1) × 3` rows for wide
    candidate pool, re-sorts in app layer with `hotScore()` for time decay.
  - `rising` sort: DB query restricted to last 24 h, wide fetch, then `isRising()` filter
    + `hotScore()` re-sort in app layer.
  - `fresh` and `top` sorts unchanged (pure DB ordering, no app-layer re-sort).

- **`src/middleware.ts`** — Added to public allow-list:
  - `/api/votes` (auth enforced in handler)
  - `/api/stream` (auth optional in handler)
  - `/api/users/top` (public)

### Key decisions

- **Application-layer re-sort for hot/rising**: avoids storing a computed score column in
  Postgres. DB fetches a wider candidate pool (`(limit+1) × 3`) ordered by heat DESC to
  ensure the true top N by hot score are captured; this is safe because the 72 h window
  keeps the candidate set small even at scale.
- **SCAN instead of KEYS for feed invalidation**: `KEYS feed:*` blocks Redis on large
  keyspaces. `SCAN` with COUNT 100 is non-blocking and safe in production.
- **Clout clamping inside the transaction**: reading the author's current clout inside the
  same transaction and using `Math.max(0, clout + delta)` for decrements is safe against
  concurrent updates because Postgres serialises writes to the same row within a transaction.
  The increment path uses Prisma's `{ increment }` for atomicity without a read.
- **Shared rate-limit bucket for drop + reply votes**: both endpoints key on `vote:<userId>`
  so the 60/min limit is per-user across all vote types, not per resource type.
- **Unauthenticated stream falls back to global hot**: no redirect or 401 — the endpoint
  degrades gracefully so the home page works for anonymous visitors.

### Verified
- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

- **Phase 4 — backend complete, frontend in progress.**
- **Next:** Phase 4 frontend — Boost/Bury vote UI, Heat score display, hot feed ranking, Clout leaderboard widget.

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

---

## 2026-06-14 — Phase 4 frontend: Boost/Bury vote buttons, Heat score, The Stream, Clout leaderboard

### Created

- **`src/components/drops/vote-buttons.tsx`** — `<VoteButtons>` client component:
  - Props: `dropId`, `initialHeat`, `initialUserVote`, `orientation` (vertical/horizontal).
  - Optimistic UI: updates heat + active state immediately, reverts on network/API error.
  - Unauthenticated: redirects to `/login` on click.
  - Active Boost: arrow turns `brand-500` (orange). Active Bury: arrow turns `indigo-500`.
  - Loading: disables both buttons, shows spinner on clicked button.
  - Hydration: if session is authenticated and `initialUserVote` was null (detail page), fetches `GET /api/drops/[id]/vote` on mount. If pre-hydrated via `voteState` prop (feed), skips the fetch.
  - Heat display: formats large numbers (1234 → "1.2k", 1_000_000 → "1M").

- **`src/hooks/use-vote-states.ts`** — `useVoteStates(dropIds)` bulk hydration hook:
  - Fetches `/api/votes?dropIds=...` once per unique dropIds list.
  - Debounced 100 ms so infinite-scroll page loads coalesce requests.
  - Returns empty map while loading or on 401 (logged-out users).
  - Merges new pages into existing state with `{ ...prev, ...data }`.

- **`src/components/widgets/clout-leaderboard.tsx`** — `<CloutLeaderboard>` async server component:
  - Direct Prisma query (top 10 by clout) — no fetch() round-trip.
  - Shows rank number, avatar (fallback initials), display name, handle, and Clout score with ⚡ icon.
  - Gold/silver/bronze rank colouring for positions 1–3.
  - Returns `null` when there are no users yet.

- **`src/app/stream/page.tsx`** — The Stream page (server component):
  - Authenticated: heading "Your Stream" + `<DropFeed feedUrl="/api/stream" />`.
  - Unauthenticated: heading "Hot Right Now" + login/register CTA in sidebar.
  - Two-column layout (feed + sidebar with `<CloutLeaderboard />`).
  - Sort tabs hidden when `feedUrl` is set (stream API owns its own sort).

### Modified

- **`src/components/drops/drop-card.tsx`**:
  - Removed placeholder `VoteColumn` — replaced with `<VoteButtons>`.
  - Added optional `voteState` prop: if provided, passes pre-hydrated heat + userVote to
    `<VoteButtons>` instead of triggering a per-card fetch.

- **`src/components/drops/drop-feed.tsx`**:
  - Added `feedUrl?: string` prop — overrides default `/api/drops` URL construction.
  - Calls `useVoteStates(drops.map(d => d.id))` for bulk hydration; passes `voteState` to each `<DropCard>`.
  - Sort tabs conditionally hidden when `feedUrl` is provided.

- **`src/app/drops/[id]/page.tsx`**:
  - Replaced placeholder `VoteColumn` with `<VoteButtons dropId={drop.id} initialHeat={drop.heat} initialUserVote={null} />`.
  - Client fetches its own vote state on mount — avoids serialising session to the client.

- **`src/app/page.tsx`**:
  - Authenticated view: two-column layout (feed + `<CloutLeaderboard />` sidebar).
  - Unauthenticated view: two-column layout added to feed preview section.

- **`src/app/h/[slug]/page.tsx`**:
  - Added `<CloutLeaderboard />` below the Wardens card in the hub sidebar.

- **`src/components/site-header.tsx`**:
  - "The Stream" nav link updated to point to `/stream` (was `/`).

### Verification

- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

**Phase 4 complete.**

**Next:** Phase 5 — Replies (threaded comments): Reply model, create/edit/delete, threaded UI with collapse/expand, Boost/Bury on replies, @mentions, notifications.
**Next:** Phase 4 — Voting & Ranking (Boost/Bury on drops + replies, Heat score, Hot/Rising algorithms, The Stream home feed, Clout, Redis vote tallies).

---

## Phase 5 — Frontend: Threaded Replies, Notifications Bell, Profile Tabs (2026-06-14)

### Added

- **`src/types/reply.ts`** — `Reply` interface matching the API `replySelect` shape, with optional
  client-assembled `children?: Reply[]` for tree rendering.

- **`src/lib/build-reply-tree.ts`** — `buildReplyTree(flat, sort)` utility: takes flat API reply
  array, builds nested tree via parent→child map, then recursively sorts each level by
  `best | top | new | controversial`.

- **`src/components/replies/reply-form.tsx`** — `<ReplyForm>` client component:
  - Textarea with 10 000-char limit and live counter.
  - POSTs to `/api/drops/[dropId]/replies`.
  - Inline 429 rate-limit and 403 membership error display.
  - Submit / Cancel buttons; calls `onSuccess(reply)` on 201.

- **`src/components/replies/reply-card.tsx`** — `<ReplyCard>` client component:
  - Collapse/expand thread via avatar + vertical gutter line click (Reddit-style).
  - Collapsed state shows "▶ u/handle (N replies)".
  - Author avatar, handle link, Clout badge, relative timestamp.
  - `react-markdown` + `remark-gfm` for body rendering; `a.mention` styled via globals.css.
  - `<VoteButtons target="reply">` in horizontal orientation.
  - Reply button → inline `<ReplyForm>` (prepends optimistically to local children).
  - Delete button for author / OVERSEER.
  - Recursive `<ReplyCard>` for children; max depth 6, then "Continue thread →" link.
  - Removed replies show `[removed]` with no vote/reply actions.

- **`src/components/replies/reply-section.tsx`** — `<ReplySection>` client component:
  - Sort tabs: Best · Top · New · Controversial.
  - "Add a reply" collapsed by default; expands to `<ReplyForm>` for authenticated users.
  - Accepts `initialReplies` prop for SSR hydration (skips first client fetch).
  - Fetches from `/api/drops/[dropId]/replies?sort=<sort>` on sort change.
  - Builds tree with `buildReplyTree()`.
  - Optimistic prepend of new top-level replies.
  - "Load more" button when ≥100 replies loaded.
  - Loading skeleton, error state with retry, empty state.

- **`src/components/notifications/notifications-bell.tsx`** — `<NotificationsBell>` client component:
  - Polls `GET /api/notifications/count` every 30 seconds.
  - Red badge showing unread count (capped at "99+").
  - Click opens dropdown panel: fetches last 10 notifications.
  - Type-specific icons and descriptions for REPLY_TO_DROP / REPLY_TO_REPLY / MENTION / DROP_BOOSTED.
  - Unread notifications have subtle highlight background + unread dot.
  - "Mark all read" → `PATCH /api/notifications { all: true }`.
  - Close on click-outside and Escape; focus returns to trigger button.

- **`src/app/u/[handle]/profile-tabs.tsx`** — `<ProfileTabs>` client component:
  - Drops tab: lists user's 20 most recent drops with hub, heat, reply count, relative time.
  - Replies tab: lists user's 20 most recent replies with parent drop title, hub, body preview, heat.
  - Tab count badges; empty states with illustrations.

### Modified

- **`src/components/drops/vote-buttons.tsx`**:
  - Added `resourceId` prop (primary); deprecated `dropId` kept as backwards-compat alias.
  - Added `target?: "drop" | "reply"` (default `"drop"`) — routes to the correct vote API.
  - All aria-labels updated to reflect the resource type.

- **`src/components/drops/drop-card.tsx`**:
  - `<VoteButtons dropId>` → `<VoteButtons resourceId>`.

- **`src/app/drops/[id]/page.tsx`**:
  - Added `getInitialReplies(dropId)` — SSR Prisma query for top 100 replies.
  - Replaced Phase 5 placeholder section with `<ReplySection dropId initialReplies>`.
  - `<VoteButtons dropId>` → `<VoteButtons resourceId>`.
  - Removed unused `redirect` import.

- **`src/components/site-header.tsx`**:
  - Added `<NotificationsBell />` between ThemeToggle and UserNav; rendered only when authenticated.

- **`src/app/u/[handle]/page.tsx`**:
  - Now server-fetches user drops (20, with hub + heat + reply count) and replies
    (20, with parent drop title + hub) in parallel.
  - Passes data to new `<ProfileTabs>` client component.

- **`src/app/globals.css`**:
  - Added `a.mention { color: brand-500; font-weight: 500; }` in `@layer components`.

### Verification

- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

**Phase 5 complete.**

**Next:** Phase 6 — Moderation & Admin: Warden tools (remove/pin/lock/ban), report system, mod log, Overseer admin panel, rate controls.

## 2026-06-14 — Phase 6 frontend: Report system, mod queue, Warden tools, Overseer admin panel

### Created

- **`src/components/moderation/report-button.tsx`** — Client component with flag icon button. Opens a modal dialog (focus-trapped, Escape closes, ARIA role="dialog") with radio selection for 6 report reasons, optional 500-char details textarea. Unauthenticated users are redirected to /login. 201 success shows "Thanks, we'll review this"; 409 shows "You've already reported this". Submits to `POST /api/reports`.

- **`src/components/moderation/drop-mod-menu.tsx`** — Warden/Overseer-only gear dropdown on DropCard. Pin/Unpin, Lock/Unlock, Remove/Restore actions each POST to `/api/drops/[id]/moderate`. Remove requires confirm dialog. Optimistic UI updates with revert on error.

- **`src/components/moderation/reply-mod-menu.tsx`** — Warden/Overseer-only Mod Remove/Restore button on ReplyCard. POSTs to `/api/replies/[id]/moderate`. Optimistic state with revert on failure.

- **`src/app/h/[slug]/mod/page.tsx`** — Server component. Auth-guards: WARDEN or OVERSEER only, else redirect to hub. Tabbed layout (Reports | Banned Users | Mod Log) driven by `?tab=` query param. Shows pending report count badge on Reports tab.

- **`src/app/h/[slug]/mod/reports-tab.tsx`** — Fetches `GET /api/reports?hubSlug=…`. Each card shows reason badge, truncated content, details, reporter, relative time. "Remove & Resolve" and "Dismiss" buttons call `PATCH /api/reports/[id]` and optimistically remove the item.

- **`src/app/h/[slug]/mod/bans-tab.tsx`** — Ban form at top (handle + reason → `POST /api/hubs/[slug]/bans`). Banned users list with unban button per row (`DELETE /api/hubs/[slug]/bans`).

- **`src/app/h/[slug]/mod/mod-log-tab.tsx`** — Table of mod log entries with human-readable action labels, moderator handle, target link, reason, relative time. Infinite scroll via "Load more" cursor pagination.

- **`src/app/admin/layout.tsx`** — OVERSEER gate (redirects to `/` otherwise). Dark sidebar nav with links to Dashboard, Users, Hubs, Reports.

- **`src/app/admin/page.tsx`** — Dashboard with 4 stat cards: total users, total hubs, total active drops, pending reports. Fetched server-side via Prisma.

- **`src/app/admin/users/page.tsx`** — Client component. Debounced (300ms) search hitting `GET /api/admin/users?q=…`. Table with avatar, handle, email, role badge, clout, join date, suspended badge. Per-row "Make/Remove Overseer" and "Suspend/Unsuspend" with confirm dialogs. PATCHes `/api/admin/users/[handle]`.

- **`src/app/admin/hubs/page.tsx`** — Client component. Table of all hubs with member/drop counts, NSFW badge, created date. "Delete Hub" per row opens type-to-confirm modal (must type hub slug). DELETEs `/api/admin/hubs/[slug]`.

- **`src/app/admin/reports/page.tsx`** — All pending reports site-wide. Fetches `GET /api/admin/reports`. Same resolve/dismiss actions as hub mod queue. Load-more pagination.

### Modified

- **`src/components/drops/drop-card.tsx`** — Added `userRole` and `userHubRole` props. Imports and renders `<ReportButton dropId={drop.id} />` and `<DropModMenu>` (gear icon, visible to wardens/overseers only). Added 🔒 Locked badge in meta bar when `drop.isLocked`.

- **`src/components/replies/reply-card.tsx`** — Added `isLocked` and `userHubRole` props (propagated to child ReplyCards). Reply button hidden when locked. Added `<ReportButton replyId={reply.id} />` and `<ReplyModMenu>`. Regular Delete button hidden for users who have the mod menu.

- **`src/components/replies/reply-section.tsx`** — Added `isLocked` prop. When locked, replaces the reply form with a locked notice. Passes `isLocked` to each `<ReplyCard>`.

- **`src/app/drops/[id]/page.tsx`** — Passes `isLocked={drop.isLocked}` to `<ReplySection>`. Added Locked badge in action bar.

- **`src/app/h/[slug]/page.tsx`** — Fetches warden status + pending report count. Shows "Mod Queue" link in sidebar for wardens/overseers with a report count badge.

- **`src/components/user-nav.tsx`** — Adds "Admin Panel" link to dropdown menu for OVERSEER users.

### Verification

- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

**Phase 6 complete.**

**Next:** Phase 7 — Discovery & Polish: search (drops/hubs/users), hub explore page, Stash (save drops), notifications center, responsive design, accessibility, SEO metadata.

---

## 2026-06-15 — Phase 8: Vitest Unit + API Tests

### Summary

Added comprehensive Vitest test coverage for core backend business logic and API route handlers. Installed `@vitest/coverage-v8` and wired up `vitest.config.ts` with path aliases, a global setup file, and coverage thresholds (lines: 70, functions: 70, branches: 60). Added `test:watch` and `test:coverage` npm scripts.

**122 tests across 10 test files — all passing.**

### Test files created

**Pure unit tests (no mocking needed):**

- **`src/lib/__tests__/ranking.test.ts`** (16 tests) — `hotScore`, `wilsonScore`, `isRising`: heat/age effects, Wilson confidence interval, rising criteria, edge cases.
- **`src/lib/__tests__/mentions.test.ts`** (17 tests) — `extractMentions` (dedup, cap at 10, handle length bounds), `linkifyMentions` (bare @handle → anchor, href-context awareness).
- **`src/lib/__tests__/build-reply-tree.test.ts`** (12 tests) — Flat→tree assembly, parent-child relationships, orphan handling, all 4 sort modes, 6-level deep nesting without stack overflow.
- **`src/lib/__tests__/markdown.test.ts`** (17 tests) — `renderMarkdown` (bold/italic/lists, script strip, XSS attributes stripped, `<img>` allowed, `<iframe>` stripped), `sanitizeHtml` (DOMPurify pass, iframe allowed for oEmbed).
- **`src/lib/__tests__/ssrf-guard.test.ts`** (13 tests) — `assertSafeUrl`: scheme checks (file://, ftp://), blocked IPv4 ranges (127.x, 10.x, 192.168.x, 172.16.x, 169.254.x), public IP accepted, DNS failure handling. Uses `vi.mock('dns')`.

**API route tests (mocked DB + Redis):**

- **`src/lib/__tests__/rate-limit.test.ts`** (7 tests) — `rateLimit`: success/remaining tracking, window exhaustion, key isolation, stale-entry pruning, rl: key prefix. In-memory sorted-set mock inside `vi.mock` factory.
- **`src/app/api/auth/__tests__/register.test.ts`** (13 tests) — POST /api/auth/register: missing/invalid fields (422), invalid email, short password, bad handle, non-JSON body (400), email/handle conflicts (409), successful 201 with no password hash leaked, DB error 500.
- **`src/app/api/drops/__tests__/vote.test.ts`** (10 tests) — POST /api/drops/[id]/vote: 401 unauthenticated, 422 invalid value, 400 non-JSON, first vote, toggle-off, flip vote (heat +2), self-vote (clout skipped), 404 missing/removed drop.
- **`src/app/api/hubs/__tests__/hubs.test.ts`** (14 tests) — POST/GET /api/hubs: 401 unauthed, 422 invalid name (uppercase/spaces/hyphens), long description, 400 non-JSON, 409 slug conflict, 201 with hub+membership, nsfw flag, GET list with counts, pagination cursor, 500 on DB error.

**Existing test (unchanged):**
- **`src/components/theme.test.ts`** (3 tests) — theme provider script.

### Infrastructure

- **`vitest.config.ts`** — `environment: node`, `setupFiles`, coverage config with v8 provider, include/exclude patterns, `@` alias.
- **`src/test/setup.ts`** — Global mocks for `next/navigation` and `next/headers`.

### Verification

- `npx vitest run` ✓ — 122/122 tests pass across 10 files
- `tsc --noEmit` ✓ — 0 type errors

---

## 2026-06-15 — Phase 8: Component tests, Playwright E2E suite, CI matrix update

### Phase 8 complete

### Dependencies installed

- `@testing-library/react` `@testing-library/user-event` `@testing-library/jest-dom` — React Testing Library stack for component tests in jsdom.
- `@vitejs/plugin-react@^4.7.0` — Vite React plugin required for JSX transform in jsdom environment.
- `@playwright/test` — Playwright E2E test runner.

### Component tests (jsdom environment)

**`src/components/drops/__tests__/vote-buttons.test.tsx`** (10 tests)
- Initial heat rendering; large number formatting (1200 → "1.2k").
- Boost button aria-pressed state, optimistic +1 on click.
- Double-click Boost toggles off, returns heat to baseline.
- Bury sets heat to -1, bury button active; flip from Bury→Boost swings heat by +2.
- Unauthenticated click redirects to `/login`, fetch never called.
- API failure reverts optimistic update.
- Reply target renders correct resource label.

**`src/components/drops/__tests__/stash-button.test.tsx`** (7 tests)
- Unfilled bookmark when not stashed; filled when stashed.
- Optimistic toggle to stashed (POST), optimistic toggle off (DELETE).
- API error and network error both revert optimistic state.
- Unauthenticated redirects to `/login`.

**`src/components/hubs/__tests__/join-button.test.tsx`** (7 tests)
- "Join" / "Joined" rendering based on initial membership state.
- Click Join: optimistic + POST call; click Leave: optimistic + DELETE call.
- API failure with error message in `role="alert"`, reverts button.
- Network error reverts; unauthenticated redirects to `/login`.

**`src/components/moderation/__tests__/report-button.test.tsx`** (10 tests)
- Report button renders; click opens `role="dialog"`.
- Dialog contains all 6 reason radio buttons.
- Reason pre-selected (Spam) → submit enabled immediately.
- Select Harassment and submit → calls `/api/reports` with correct body.
- 200 response shows "Thanks, we'll review this" confirmation.
- 409 response shows "already reported" message.
- Escape key closes dialog; Cancel button closes dialog.
- Unauthenticated click redirects to `/login`.

**`src/components/replies/__tests__/reply-form.test.tsx`** (11 tests)
- Renders textarea + Reply/Cancel buttons; submit disabled when empty.
- Typing text enables submit; Cancel calls `onCancel`.
- Submit empty form does not call fetch.
- Successful submit calls POST with correct body + `parentId`; calls `onSuccess` with returned reply; clears textarea.
- 429 → rate-limit error inline; 403 → membership error; network error → connection error.

**`src/components/notifications/__tests__/notifications-bell.test.tsx`** (8 tests)
- Bell button renders; no badge at 0 unread.
- Badge "3" at 3 unread; badge "99+" at 100 unread.
- Click bell → dropdown `role="dialog"` opens, notification descriptions rendered.
- Empty state renders "No notifications yet".
- "Mark all read" calls `PATCH /api/notifications`, badge disappears.
- Escape key closes dropdown.

### Playwright E2E setup

- **`playwright.config.ts`** — Chromium, sequential workers, `baseURL: http://localhost:3000`, `webServer` starts `next dev`, `reuseExistingServer` in local mode.
- **`e2e/postup.spec.ts`** — Full golden-path suite:
  - Home page loads · Register · Login · Create hub · Post text drop · Boost a drop · Reply to a drop · Stash/unstash · Warden pin · Search.
  - All tests guarded by `test.skip(!E2E_ENABLED)` when `CI=true` — skipped automatically in CI where no seeded DB is available.
  - `login()` helper pre-fills email/password for seeded credentials (`overseer@postup.dev`, `testuser@postup.dev`).

### Infrastructure updates

- **`vitest.config.ts`** — Added `@vitejs/plugin-react` plugin; `environmentMatchGlobs` routes `src/components/**/*.test.*` to jsdom; coverage `include` extended to `src/components/**`; `globals: true`.
- **`src/test/setup.ts`** — Added `@testing-library/jest-dom` import; extended `next-auth/react` mock to include `role`, `clout`, and `update` fields matching the augmented session type.
- **`package.json`** — Added `e2e`, `e2e:ui`, `e2e:report` scripts.
- **`.github/workflows/ci.yml`** — Split monolithic job into 3 parallel jobs: `lint-typecheck`, `unit-tests`, `build` (build waits for both). Added top-level comment explaining E2E CI exclusion.

### Verification

- `vitest run` ✓ — 175/175 tests pass across 16 files (122 existing + 53 new component tests)
- `tsc --noEmit` ✓ — 0 type errors

**Next:** Phase 9 — Deploy-Ready: production Docker build, env docs, deploy guide, polished README with screenshots placeholder.

---

## 2026-06-15 — Phase 9: Infrastructure — Health check, prod Docker compose, entrypoint, security headers, env docs

### Created

- **`src/app/api/health/route.ts`** — `GET /api/health` health check endpoint:
  - Checks Postgres (`db.$queryRaw\`SELECT 1\`` with 3s timeout), Redis (`redis.ping()` with 2s timeout), and S3/MinIO (`HeadBucketCommand` with 3s timeout) independently.
  - Returns `{ status, timestamp, services: { database, redis, storage }, version }`.
  - HTTP 200 when all services are `"ok"`, 503 when any are `"error"` — JSON body always present.
  - Each check is wrapped in an independent `withTimeout()` + `try/catch` so one failing service never prevents the others from being reported.
  - Added `/api/health` to the middleware public allow-list.

- **`docker-compose.prod.yml`** — Production single-server Compose file:
  - `migrate` one-shot service: runs `npx prisma migrate deploy` before app starts; `depends_on` postgres (healthy), `restart: no`.
  - `app` service: bound to `127.0.0.1:3000` only (reverse proxy in front), health check via `wget /api/health`, `depends_on` postgres + redis + migrate (completed_successfully).
  - `postgres:16-alpine`: no exposed port (internal network only), `restart: unless-stopped`.
  - `redis:7-alpine`: `--requirepass ${REDIS_PASSWORD}`, AOF enabled, no exposed port, `restart: unless-stopped`.
  - MinIO block included but commented out (use external S3 in production; uncomment for self-hosted).
  - Named volumes with `driver: local` + explicit `driver_opts` (bind-mount to `/opt/postup/data/`).
  - `postup-internal` bridge network (not exposed to host; `internal: false` so app can reach external S3/OAuth/SMTP).

- **`scripts/entrypoint.sh`** — Container entrypoint (`set -e`):
  - Runs `npx prisma migrate deploy` then `exec node server.js`.
  - Ensures migrations always run before the Next.js server starts in any containerised environment.

- **`.env.production.example`** — Production env template:
  - All vars from `.env.example` plus: `NODE_ENV=production`, `NEXTAUTH_URL=https://your-domain.com`, `DATABASE_URL` with `sslmode=require`, `REDIS_URL` with password, `REDIS_PASSWORD`, `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET` for real S3, OAuth provider instructions.

- **`prisma/README.md`** — Migration strategy documentation:
  - Development: `npm run db:migrate` (creates + applies migration files).
  - Production: `npx prisma migrate deploy` (applies existing files only, never creates).
  - Rollback: manual down-SQL + `prisma migrate resolve --rolled-back` process documented.
  - Seeding: development/staging only. CI entrypoint strategy explained.

### Modified

- **`Dockerfile`** — Runner stage updated:
  - Copies `scripts/entrypoint.sh`, runs `chmod +x` + `chown nextjs:nodejs` before `USER nextjs`.
  - `CMD` changed from `["node", "server.js"]` to `["./entrypoint.sh"]`.

- **`next.config.mjs`** — Three additions:
  1. `securityHeaders` array: `X-DNS-Prefetch-Control`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and a full `Content-Security-Policy` (default-src 'self', script/style unsafe-inline for Next.js, img-src includes MinIO + HTTPS, frame-src YouTube/Vimeo/Twitter).
  2. `async headers()` function applies `securityHeaders` to all routes (`"/(.*)"` source).
  3. Custom `webpack()` function: adds an `externals` handler that rewrites `node:crypto` → `crypto`, `node:fs` → `fs`, etc. — fixes Prisma 7's `node:` protocol imports which Next.js 14 webpack cannot resolve out of the box. Also adds `experimental.serverComponentsExternalPackages` for the full list of server-only packages.

- **`src/lib/env.ts`** — Added `REDIS_PASSWORD: z.string().optional()` to the env schema for production Redis auth.

- **`src/middleware.ts`** — Added `/api/health` to public allow-list (Docker health check must be unauthenticated).

- **`package.json`** — Added `"migrate:prod": "prisma migrate deploy"` and `"start:prod": "NODE_ENV=production node .next/standalone/server.js"`.

- **`src/app/(auth)/login/page.tsx`** — Wrapped `useSearchParams()` in a Suspense boundary (required by Next.js 14 for static export — was causing build-time prerender error).

- **`src/app/sitemap.ts`** — Added `export const dynamic = "force-dynamic"` (prevents Next.js from trying to prerender sitemap at build time without a live DB).

- **`src/app/admin/page.tsx`** — Added `export const dynamic = 'force-dynamic'` (admin dashboard queries DB; must render on demand).

### Build fixes

The Prisma 7 + Next.js 14 combination has a known webpack incompatibility: `@prisma/client/runtime/client.mjs` uses `node:crypto`, `node:fs`, `node:path`, `node:os`, `node:module` — URI schemes that webpack 5 cannot resolve by default. Fixed via a custom webpack `externals` function that strips the `node:` prefix and emits `commonjs <module>` for each match, allowing the standard Node.js built-in resolution to take over.

### Verification

- `npm run build` ✓ — production build succeeds, all 66 routes compiled
- `tsc --noEmit` ✓ — 0 type errors
- `vitest run` ✓ — 175/175 tests pass across 16 files

**Phase 9 complete.**

---

## 2026-06-14 — Phase 9: Documentation — Polished README, comprehensive deploy guide

### Created

- **`DEPLOY.md`** — Comprehensive deployment guide covering three deployment paths:
  - **Option A: Railway** — managed Postgres + Redis, Dockerfile auto-detected, step-by-step env var setup, Cloudflare R2 S3 walkthrough, custom domain + TLS via Railway.
  - **Option B: Fly.io** — `fly launch` auto-detection, `fly postgres create` + attach, Upstash Redis integration, Tigris S3-compatible storage via `fly storage create`, `fly secrets set` for all vars.
  - **Option C: VPS with Docker Compose** — Ubuntu 22.04 provisioning, Docker install, `docker-compose.prod.yml` usage, full Nginx reverse-proxy config with SSL, Certbot certificate setup, deploy + monitoring commands.
  - Full environment variables reference table (all vars, required flag, description, example).
  - Database migrations section linking to `prisma/README.md`; note on automatic migration via `entrypoint.sh`.
  - Health monitoring section: `GET /api/health` response schema, UptimeRobot and Better Uptime as free monitoring options.
  - S3/storage options comparison table: Cloudflare R2, Backblaze B2, MinIO, AWS S3, Tigris.
  - Troubleshooting guide: DB connection refused, Redis auth failure, Prisma Client not generated, Zod env validation error, large video upload 413, database reset procedure.

### Modified

- **`README.md`** — Full portfolio-quality rewrite:
  - CI/TypeScript/License badges.
  - Overview paragraph (2 sentences).
  - Lexicon table (all 10 branded terms).
  - Features section grouped by domain: Communities, Content, Discovery, Voting & Ranking, Moderation, Notifications & UX, Tech.
  - Tech Stack table with version and role for all 15 dependencies.
  - Architecture prose covering App Router server components, Prisma singleton, Redis graceful degradation, S3 media streaming, Zod env validation, security headers, and SSRF guard.
  - Project Status table — all Phases 0–9 marked ✅; Security / QA / Ship marked 🚧.
  - Getting Started (Local Development) with numbered steps and seeded credentials table.
  - Available Scripts table — all 21 npm scripts including new `start:prod`, `test:watch`, `test:coverage`, `e2e`, `e2e:ui`, `e2e:report`, `migrate:prod`.
  - Testing section with commands and explanation of CI vs local E2E.
  - Deployment section linking to `DEPLOY.md` with quick-comparison table of the three options.
  - Contributing section (fork → branch → PR).
  - License.

### Verification

- `tsc --noEmit` ✓ (0 errors)
- `npm run lint` ✓ (0 warnings)

**Phase 9 complete (docs). All pre-security phases complete.**

**Next phases: SECURITY → QA → SHIP**

---

## 2026-06-22 — SECURITY PHASE

### Summary

Full security audit and hardening pass. No critical vulnerabilities found in application code; all issues addressed.

### Dependency CVEs

- **Next.js upgraded 14.2.5 → 14.2.35** — patches 20+ CVEs including auth bypass (GHSA-7gfc-8cq8-jh5f), cache poisoning (GHSA-gp8f-8m3g-qvj9), middleware redirect SSRF (GHSA-4342-x723-ch2f), and others.
- Remaining audit findings are all dev-only (esbuild via vitest, eslint glob) — do not affect the production bundle.

### Authentication hardening

- **Login rate limiting per email** — added second rate-limit key `login:email:<email>` in addition to IP key, preventing account targeting via IP rotation (`src/lib/auth.ts`).
- **Suspended accounts** — session callback now returns `null` (destroying the session) when the DB user is suspended. `requireAuth()` adds a defence-in-depth DB check on every authenticated API call, catching stale session tokens (`src/lib/auth-helpers.ts`, `src/lib/auth.ts`).
- **IP extraction centralised** — `extractClientIp(request)` helper in `src/lib/rate-limit.ts`; all endpoints using IP-keyed rate limits now call this instead of duplicating the XFF logic.

### File upload hardening

- **`/api/media/image`** — switched from declared `Content-Type` to magic-bytes detection via `file-type` before passing to `sharp`. Size check moved before buffer read. Sharp still validates independently as a second layer.
- **`/api/media/video`** — same magic-bytes pattern; video goes directly to S3 without transcoding so content verification was the only guard.
- **`/api/user/avatar`**, **`/api/hubs/[slug]/icon`**, **`/api/hubs/[slug]/banner`** — same fix (completed in prior session); also migrated from local `public/` writes to S3/MinIO storage.

### Security headers

- Added `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (2-year HSTS).
- Set `X-XSS-Protection: 0` (disables the deprecated browser XSS auditor, which can itself be exploited).
- Removed `'unsafe-eval'` from `script-src` CSP directive.

### SECURITY.md

Created `SECURITY.md` documenting all security controls: auth/session, authorisation, injection prevention, XSS, SSRF, file uploads, security headers, rate limits, and known limitations/future work.

### Test fixes

Updated `src/app/api/hubs/__tests__/hubs.test.ts` and `src/app/api/drops/__tests__/vote.test.ts` — added `db.user` to the mock factory and a default `{ suspended: false }` return in `beforeEach` to cover the new suspended check in `requireAuth()`.

### Verification

- `tsc --noEmit` ✓ (0 errors)
- `vitest run` ✓ — 175/175 tests pass across 16 files

**SECURITY PHASE complete.**

**Next: QA PHASE — bring full stack up via Docker Compose, run all tests + E2E, manually verify every feature.**

---

## 2026-06-22 — QA PHASE

### Infrastructure

- **Docker Compose** — Postgres 16, Redis 7, MinIO all started healthy.
- **Schema** — `prisma db push` applied (no migration files yet; created from schema directly for QA environment).
- **Seed** — 3 users (admin OVERSEER, alice MEMBER, qatest MEMBER), 2 hubs (gaming, programming), 4 memberships, 2 drops. Run via `npx tsx prisma/seed.ts`.
- **MinIO bucket** — `postup` bucket created with public-read policy via `mc mb`.
- **Dev server** — `npm run dev` started; all services healthy (`GET /api/health` → `{"status":"ok","services":{"database":"ok","redis":"ok","storage":"ok"}}`).

### Middleware fix

The `src/middleware.ts` was importing `auth` from `@/lib/auth`, which pulls in `@auth/prisma-adapter` → `pg` → Node.js `crypto` — unavailable in the Edge runtime. This caused a 500 on every route. Fixed by replacing the `auth()` wrapper with a lightweight cookie-presence check (`authjs.session-token` / `__Secure-authjs.session-token`). Auth validation (session DB lookup + suspended check) still happens in every handler via `requireAuth()`. Production build confirmed this makes middleware just 27 kB instead of bundling the full DB adapter.

### API QA results

**Public endpoints — all ✓**

| Endpoint | Result |
|---|---|
| `GET /api/health` | `{"status":"ok"}` — DB, Redis, Storage all ok |
| `GET /api/hubs?sort=popular` | 2 hubs returned |
| `GET /api/hubs/gaming` | Hub detail with counts |
| `GET /api/drops?sort=fresh` | 2 drops returned |
| `GET /api/drops/:id` | Drop detail with author + hub |
| `GET /api/drops/:id/replies` | 0 replies (correctly empty) |
| `GET /api/users/top` | 3 users with clout |
| `GET /api/hubs/trending` | 2 trending hubs |
| `GET /api/hubs/recommended` | 2 recommended hubs (anon) |
| `GET /api/stream` | 2 drops in global hot feed |
| `GET /api/search?q=programming` | FTS returning hub match |

**Auth enforcement — all ✓**

All protected routes correctly deny unauthenticated access:
- API routes with `requireAuth()` in handler → **401** (POST /api/drops, POST /api/hubs, POST /api/reports, POST /api/drops/:id/replies)
- Routes behind middleware-only guard → **307 redirect to /login** (/api/admin/*, /api/user/stash, /api/notifications, /api/drops/:id/vote)

**DB-layer QA (all models exercised) — all ✓**

Via direct Prisma script: vote (heat + clout delta), threaded reply creation, stash toggle, report filing, mod log entry, notification creation, hub ban. All invariants hold.

### Test suite

- `vitest run` ✓ — **175/175 tests** across 16 files
- `npm run build` ✓ — production build succeeds, 66 routes compiled, middleware 27 kB

### Known manual verification needed (requires browser)

The Chrome extension was not connected during this session. The following flows need visual browser verification before ship:
- Login / register form UX (error states, OAuth buttons)
- Drop creation form — all 4 types (TEXT/IMAGE/VIDEO/LINK) including file upload + link preview
- Drop detail page — markdown rendering, oEmbed (YouTube/Vimeo), NSFW overlay
- Hub page — join/leave button, hub settings, warden management
- Voting UI — Boost/Bury optimistic update, heat display
- Reply thread — collapse/expand, inline reply form, @mention rendering
- Stash page, Notifications center (mark as read, bell badge)
- Search results page (tabs: All/Drops/Hubs/Users)
- Mod queue — report → resolve/dismiss, ban/unban, mod log
- Admin panel — user list, hub list, site-wide reports
- Responsive layout and dark/light theme toggle

**QA PHASE complete (automated). Manual browser QA recommended before v1.0.0 tag.**

**Next: SHIP PHASE — push to public repo, tag v1.0.0, notify Yanis.**
