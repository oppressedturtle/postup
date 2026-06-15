# PostUp

A Reddit-class community platform — create **Hubs**, share **Drops**, and rise on **The Stream**.

![CI](https://github.com/oppressedturtle/postup/actions/workflows/ci.yml/badge.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)
![License](https://img.shields.io/badge/license-MIT-green)

> Screenshots coming after deployment.

---

## Overview

PostUp is a full-stack community platform built to Reddit-class feature depth: communities (Hubs), rich-media posts (Drops), threaded replies, Boost/Bury voting, personalised feeds, full moderation tools, and site-wide administration. It is a portfolio project by Yanis (oppressedturtle), built incrementally across 9 phases — tested, containerised, CI'd, and deploy-ready.

---

## Lexicon

PostUp uses its own domain vocabulary throughout the UI, codebase, and documentation.

| Term | Meaning |
|---|---|
| **Hub** | A community, addressed as `h/<name>` (e.g. `h/gaming`) |
| **Drop** | A post — text (markdown), image, video, or link |
| **Boost / Bury** | Upvote / downvote |
| **Heat** | A Drop's net score (Boosts minus Buries) |
| **Clout** | User reputation earned when your Drops and Replies are Boosted |
| **Warden** | Hub-level moderator |
| **Overseer** | Site-wide administrator |
| **The Stream** | Your personalised home feed, ranked Hot · Rising · Fresh · Top |
| **Stash** | Your saved Drops |
| **Reply** | A comment — fully threaded, votable |

---

## Features

### Communities
- Create Hubs with name, description, rules, icon, and banner; NSFW flag
- Join / leave; member counts; membership-gated posting
- Role-based access: Member / Warden / Overseer
- Hub settings page with identity, icon/banner upload, Warden management, and danger zone

### Content
- **Text Drops** — markdown editor with live preview, XSS-sanitised rendering
- **Image Drops** — upload (JPEG/PNG/GIF/WebP up to 20 MB), auto-converted to WebP via sharp, EXIF stripped
- **Video Drops** — upload (MP4/WebM/MOV up to 500 MB), in-app HTML5 player
- **Link Drops** — Open Graph rich previews (title, image, description, domain)
- **Embedded media** — YouTube, Vimeo, and Twitter/X play inline via oEmbed
- Edit and soft-delete (author); Warden/Overseer removal with content clearing

### Discovery
- Full-text search across Drops, Hubs, and Users (Postgres FTS with `tsvector`)
- Hub explore / directory page with Popular and New tabs
- Trending Hubs widget (drop activity in last 24 h)
- Recommended Hubs (top by member count, excluding already-joined)
- Dynamic sitemap, `robots.txt`, edge-rendered OG images

### Voting & Ranking
- Boost / Bury on Drops and Replies (one vote per user, toggleable)
- Heat score updated atomically; Clout accrues to authors (never goes below 0)
- **Hot** — time-decay score (Reddit-style log scale); **Rising** — positive + < 24 h; **Fresh** — newest; **Top** — by time window
- **The Stream** — personalised home feed from joined Hubs, Hot fallback for new users; anonymous visitors see global Hot
- Clout leaderboard sidebar (top 10 by Clout)
- Redis-backed vote tallies and cached feed pages; graceful fallback to Postgres on cache miss

### Moderation
- **Warden** tools: pin/unpin Drop, lock/unlock thread, remove Drop or Reply, ban member from Hub
- Report system: users report Drops/Replies → hub mod queue; Wardens resolve or dismiss
- Mod log (audit trail of all mod actions, publicly visible per hub)
- **Overseer** panel: manage users (role, suspend), manage Hubs (list, delete), global report queue
- New-account post/reply rate limits; ban cache with Redis + graceful DB fallback

### Notifications & UX
- @mention alerts in Replies; unread notification count badge (polls every 30 s)
- Notifications centre with Today / Yesterday / Earlier grouping; infinite scroll; mark-all-read
- Stash (save Drops for later); Stash page with Remove from Stash
- Responsive layout, mobile nav drawer, keyboard navigation, ARIA roles throughout
- Dark / light theme with no-flash SSR script

### Tech
- Next.js 14 App Router — all data-fetching pages are React Server Components
- Strict TypeScript (`noUncheckedIndexedAccess`), Zod env validation at startup
- GitHub Actions CI: lint → typecheck → unit tests → build (parallel jobs)
- 175 tests: Vitest unit + API + component (Testing Library); Playwright E2E golden path
- Production Docker image (multi-stage, standalone bundle, non-root user)
- `GET /api/health` endpoint with Postgres, Redis, and S3 service checks

---

## Tech Stack

| Technology | Version | Role |
|---|---|---|
| **Next.js** | 14 | Full-stack framework — App Router, server components, API routes |
| **TypeScript** | 5.5 | End-to-end type safety; strict mode + `noUncheckedIndexedAccess` |
| **PostgreSQL** | 16 | Primary relational database |
| **Prisma** | 7 | ORM — schema-first, typed query builder, migrations, seed script |
| **Redis** | 7 | Vote tally caching, feed ranking, session store, rate-limit counters |
| **MinIO / S3** | — | S3-compatible object storage for images and videos (MinIO in dev) |
| **Auth.js (NextAuth)** | v5 beta | Authentication — email/password + OAuth (GitHub, Google); httpOnly sessions |
| **Tailwind CSS** | 3 | Utility-first styling; custom "Heat" brand palette; dark/light themes |
| **Zod** | 4 | Runtime environment validation; all env vars typed and checked at startup |
| **pino** | 10 | Structured JSON logging (pino-pretty for dev, NDJSON in prod) |
| **ioredis** | 5 | Redis client with full TypeScript support |
| **sharp** | 0.35 | Image processing — resize, WebP conversion, EXIF strip |
| **Vitest** | 2 | Unit, API route, and component tests |
| **Playwright** | 1.60 | E2E golden-path test suite |
| **Docker Compose** | — | Local dev stack (Postgres + Redis + MinIO) and production single-server config |

---

## Architecture

PostUp is a Next.js 14 App Router application. All data-fetching pages are React Server Components — no client-side waterfall fetches for initial renders. The Prisma client is a process-level singleton (safe across Next.js hot-reloads) backed by PostgreSQL 16 via the `@prisma/adapter-pg` driver adapter.

Redis (ioredis) caches vote tallies, ranked feed pages, and rate-limit sliding windows, with a graceful-degradation pattern so a Redis miss falls through to Postgres without crashing. Media uploads (images, videos) are streamed directly to MinIO (or any S3-compatible bucket in production) — the app never stores binary data in Postgres.

All required environment variables are validated at startup through a single Zod schema in `src/lib/env.ts`; missing or malformed config throws a descriptive error before the server accepts traffic. Security headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`, Referrer Policy, Permissions Policy) are applied globally via `next.config.mjs`.

Link previews and oEmbed fetches are SSRF-guarded: the fetcher resolves the hostname via DNS before checking IP ranges, blocking rebinding attacks. oEmbed provider endpoints are hardcoded — never derived from user input.

---

## Project Status

| Phase | Description | Status |
|---|---|---|
| **0** | Foundation — Next.js scaffold, Prisma/Postgres, Redis, Docker Compose, CI | ✅ |
| **1** | Auth & Profiles — Auth.js, email/password + OAuth, profile pages, settings | ✅ |
| **2** | Hubs — create, join/leave, roles, settings, Warden management | ✅ |
| **3** | Drops & Media — text/image/video/link, rich previews, oEmbed, SSRF guard | ✅ |
| **4** | Voting & Ranking — Boost/Bury, Heat, Hot/Rising/Fresh/Top, The Stream, Clout | ✅ |
| **5** | Replies — threaded comments, @mentions, notifications, vote on replies | ✅ |
| **6** | Moderation — Warden tools, report system, mod log, Overseer admin panel | ✅ |
| **7** | Discovery & Polish — search, Stash, trending/recommended, responsive, SEO | ✅ |
| **8** | Hardening & Tests — Vitest unit/API/component, Playwright E2E, CI matrix | ✅ |
| **9** | Deploy-Ready — prod Docker Compose, health check, security headers, env docs | ✅ |
| **Security** | Full security audit — CVEs, authz review, XSS/SSRF, headers, secrets | 🚧 |
| **QA** | Full-stack manual QA pass, all features verified green | 🚧 |
| **Ship** | Tag v1.0.0, public release | 🚧 |

See [`ROADMAP.md`](./ROADMAP.md) for the full build plan and [`PROGRESS.md`](./PROGRESS.md) for the detailed daily log.

---

## Getting Started (Local Development)

### Prerequisites

- **Node.js** 20+ — `node --version`
- **Docker** and **Docker Compose** — `docker --version`

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/oppressedturtle/postup.git
cd postup

# 2. Copy the example env file (defaults work out of the box for local Docker dev)
cp .env.example .env

# 3. Start Postgres, Redis, and MinIO
npm run docker:up
# Waits for healthchecks; all three containers must be healthy before proceeding

# 4. Install dependencies
npm install

# 5. Run the initial database migration
npm run db:migrate
# Prisma will prompt for a migration name — enter "init"

# 6. Seed the database with demo data
npm run db:seed

# 7. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Seeded credentials**

| Handle | Password | Role |
|---|---|---|
| `admin` | `password123` | Overseer (site admin) |
| `alice` | `password123` | Member |

---

## Available Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `next dev` | Start development server with hot-reload |
| `build` | `next build` | Production build (outputs `standalone` bundle) |
| `start` | `next start` | Start production server (after `build`) |
| `start:prod` | `node .next/standalone/server.js` | Start standalone production server directly |
| `lint` | `next lint` | ESLint — `next/core-web-vitals` + Prettier rules |
| `typecheck` | `tsc --noEmit` | TypeScript type-check with no emit |
| `format` | `prettier --check` | Check formatting across `src/**` |
| `format:write` | `prettier --write` | Auto-fix formatting |
| `test` | `vitest run` | Run all unit + component tests once (CI mode) |
| `test:watch` | `vitest` | Run tests in watch mode |
| `test:coverage` | `vitest run --coverage` | Run tests with v8 coverage report |
| `e2e` | `playwright test` | Run Playwright E2E suite (requires running dev server + seeded DB) |
| `e2e:ui` | `playwright test --ui` | Run E2E in Playwright UI mode |
| `e2e:report` | `playwright show-report` | Open last E2E HTML report |
| `db:generate` | `prisma generate` | Re-generate Prisma Client after schema changes |
| `db:migrate` | `prisma migrate dev` | Create and apply a new migration (dev only) |
| `db:seed` | `prisma db seed` | Run the seed script (`prisma/seed.ts`) |
| `db:studio` | `prisma studio` | Open Prisma Studio GUI at localhost:5555 |
| `migrate:prod` | `prisma migrate deploy` | Apply pending migrations to production database |
| `docker:up` | `docker compose up -d` | Start Postgres, Redis, MinIO in the background |
| `docker:down` | `docker compose down` | Stop and remove containers |
| `docker:logs` | `docker compose logs -f` | Tail all container logs |

---

## Testing

```bash
# Unit + API + component tests
npm test

# With coverage report (output to ./coverage/)
npm run test:coverage

# E2E (requires: npm run docker:up && npm run db:seed && npm run dev in a separate terminal)
npm run e2e
```

The CI workflow runs `lint-typecheck`, `unit-tests`, and `build` as parallel jobs on every push and pull request to `main`. Playwright E2E tests are excluded from CI — they require a running seeded database and are guarded by `test.skip(!E2E_ENABLED)` when `CI=true`. Run them locally.

---

## Deployment

See **[`DEPLOY.md`](./DEPLOY.md)** for the complete deployment guide covering Railway, Fly.io, and VPS (Docker Compose + Nginx + SSL).

**Quick summary of options:**

| Option | Best for | Effort |
|---|---|---|
| **Railway** | Simplest managed deployment | Low |
| **Fly.io** | Container-native, global edge | Medium |
| **VPS + Docker Compose** | Full control, lowest cost at scale | Medium |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m "feat: description"`
4. Push to the branch: `git push origin feat/your-feature`
5. Open a Pull Request

---

## License

MIT — Yanis (oppressedturtle)
