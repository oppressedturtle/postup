# PostUp — Roadmap

**Stack:** Next.js (App Router) · TypeScript · Postgres · Prisma · Tailwind · Redis · S3-compatible storage
**Goal:** Production-grade community platform (Reddit-class): hubs, drops, threaded replies, voting, media, moderation. Portfolio-quality: tested, containerized, CI'd, deploy-ready.
**Repo visibility:** public — Yanis's portfolio.

## Lexicon (our own branding — use these names everywhere in UI + code domain)
- **Hub** = community/subreddit, addressed `h/<name>` (e.g. `h/gaming`)
- **Drop** = a post (text, image, video, or link)
- **Boost / Bury** = upvote / downvote; **Heat** = net score
- **Clout** = user reputation (earned from Boosts on your drops/replies)
- **Warden** = hub moderator · **Overseer** = site-wide admin
- **The Stream** = personalized home feed · sorts: **Hot · Rising · Fresh · Top**
- **Stash** = saved drops · **Reply** = comment (threaded)

Each roadmap item is a self-contained increment the coder agent completes in one daily session, then commits + pushes. Check items off in order; skip ahead only if blocked.

## Phase 0 — Foundation
- [x] Next.js (App Router) + TypeScript + Tailwind, ESLint/Prettier, base layout + theme (dark/light)
- [x] Postgres + Prisma setup, initial schema migration, DB connection, seed script scaffold
- [x] Redis connection (caching/feed ranking), env config + validation (zod), structured logging
- [x] Docker Compose (app + Postgres + Redis + MinIO for S3-compatible storage), Dockerfile (multi-stage)
- [x] Root README with lexicon + features, MIT LICENSE, CI workflow stub

## Phase 1 — Auth & Profiles
- [x] Auth (email/password + OAuth GitHub/Google) via Auth.js (NextAuth), httpOnly sessions
- [x] User model: handle, avatar, bio, **Clout** counter, joined date
- [x] Public profile pages (`u/<handle>`): their drops, replies, Clout, hubs
- [x] Account settings, avatar upload, input validation + rate limiting on auth

## Phase 2 — Hubs (Communities)
- [x] Hub model (name, slug `h/<name>`, description, rules, icon, banner, NSFW flag, created-by)
- [x] Create hub flow (creator becomes owner-**Warden**), hub settings page
- [x] Membership (join/leave), member counts, membership-gated actions
- [x] Hub page: about sidebar, rules, banner/icon, drop feed scoped to hub
- [x] Roles & authorization: member / **Warden** / **Overseer**; per-action permission checks

## Phase 3 — Drops (Posts) & Media
- [x] Drop model (type: text|image|video|link, title, body markdown, hub, author, timestamps)
- [x] Create drop: rich text/markdown editor with preview
- [x] Image upload (to S3/MinIO), client+server validation, thumbnails
- [x] Video upload (to S3/MinIO), in-app HTML5 player, size/type limits, poster frame
- [x] Link drops with **rich previews** (Open Graph scraping: title, image, description, domain)
- [x] Embedded media: YouTube/Vimeo/Twitter via oEmbed — playable/rendered inline in the app
- [x] Drop detail page, edit/delete (author), markdown sanitization (XSS-safe)

## Phase 4 — Voting & Ranking
- [x] **Boost/Bury** on drops (one vote per user, toggle/switch), **Heat** score, optimistic UI
- [x] Ranking algorithms: **Hot** (time-decay), **Rising**, **Fresh** (new), **Top** (by window)
- [x] **The Stream**: personalized home feed from joined hubs + Hot fallback, pagination/infinite scroll
- [x] **Clout**: award/deduct on author when their drop/reply is Boosted/Buried
- [x] Redis-backed vote tallies + cached feed pages for performance

## Phase 5 — Replies (Comments)
- [x] Reply model (threaded/nested, parent ref), create/edit/delete
- [x] Threaded UI with collapse/expand, "load more replies", continue-thread
- [x] **Boost/Bury** on replies, Heat-based sort (Best/Top/New/Controversial)
- [x] @mentions in replies + notifications, markdown + sanitization

## Phase 6 — Moderation & Admin
- [x] **Warden** tools per hub: remove drop/reply, pin drop, lock thread, ban member from hub
- [x] Report system: users report drops/replies → hub mod queue
- [x] Mod log (audit trail of mod actions)
- [x] **Overseer** (site admin) panel: manage users (ban/suspend), manage hubs, global report queue, takedowns
- [x] Spam/rate controls: per-user post/vote rate limits, new-account restrictions

## Phase 7 — Discovery & Polish
- [x] Search (drops, hubs, users) — Postgres full-text
- [x] Hub discovery/explore page, trending hubs, recommended hubs
- [x] **Stash** (save drops), user notifications center, unread counts
- [x] Responsive design pass, keyboard nav, loading/empty/error states, toasts, accessibility (ARIA)
- [x] SEO: SSR metadata, Open Graph tags for drops/hubs, sitemap

## Phase 8 — Hardening & Tests
- [x] Server/API tests (Vitest) for auth, hubs, drops, voting, moderation — >70% on core
- [x] Component tests (Testing Library) for key flows
- [x] E2E (Playwright): signup → create hub → post drop → boost → reply → moderate
- [x] GitHub Actions CI: lint, typecheck, test, build, prisma validate on every push/PR
- [x] Seed script with demo hubs/drops/users, OpenAPI/Swagger or documented API routes

## Phase 9 — Deploy-Ready
- [x] Production Docker build, env documentation, DB migration strategy
- [x] Deploy guide (Vercel/Railway/Fly + managed Postgres + Redis + S3 bucket)
- [x] Polished README: screenshots/GIF, feature list, lexicon, architecture diagram, live-demo placeholder

## SECURITY PHASE (after Phase 9, by the security agent)
Full audit + fixes: dependency CVEs (`npm audit`), authz on every route + mod/admin action, SQL injection (Prisma safe params), XSS (markdown/oEmbed/link-preview sanitization — critical here), SSRF on link-preview/oEmbed fetchers (block internal IPs), file-upload hardening (type/size/content sniffing, no executable serving), JWT/session/secret handling, CORS, helmet/security headers, rate limiting, secrets never committed. Document in `SECURITY.md`.

## QA PHASE (after security)
Bring full stack up via Docker Compose, run all tests + E2E, manually verify every feature (auth, hubs, all 4 drop types incl. video + embeds + link previews, voting, threaded replies, Warden + Overseer moderation). Log results in `PROGRESS.md`. Proceed to ship only when green.

## SHIP PHASE (after QA green)
Push final commits/tags to the **public** repo under `oppressedturtle`, verify CI passes, tag `v1.0.0`, notify Yanis for review.
