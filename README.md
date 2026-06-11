# PostUp

A Reddit-class community platform — create **Hubs**, share **Drops**, and rise on **The Stream**.

> Portfolio project by Yanis (oppressedturtle) — built incrementally, the honest way.

---

## Lexicon

PostUp uses its own domain vocabulary everywhere — in the UI, codebase, and documentation.

| Term | Meaning |
|---|---|
| **Hub** | A community, addressed as `h/<name>` (e.g. `h/gaming`) |
| **Drop** | A post — text (markdown), image, video, or link |
| **Boost / Bury** | Upvote / downvote |
| **Heat** | A drop's net score (Boosts minus Buries) |
| **Clout** | User reputation earned when your drops and replies are Boosted |
| **Warden** | Hub-level moderator |
| **Overseer** | Site-wide administrator |
| **The Stream** | Your personalized home feed, ranked Hot · Rising · Fresh · Top |
| **Stash** | Your saved drops |
| **Reply** | A comment — fully threaded, votable |

---

## Feature Overview

- **Community Hubs** — create hubs with name, description, rules, icon, and banner; join/leave; role-based membership (Member / Warden / Overseer)
- **Rich Drops** — post text (markdown with preview), images, videos (in-app HTML5 player), or links with Open Graph rich previews
- **Embedded Media** — YouTube, Vimeo, and other providers play inline via oEmbed
- **Voting** — Boost/Bury drops and replies (one vote per user, toggleable); Heat score updated in real time; Clout accrues to authors
- **Ranking** — Hot (time-decay), Rising, Fresh (newest), Top (by time window) across hub feeds and The Stream
- **Threaded Replies** — fully nested comments; collapse/expand; @mentions; markdown + XSS sanitization
- **The Stream** — personalized home feed aggregating drops from your joined hubs with Hot fallback for new users
- **Stash** — save drops for later, scoped to your account
- **Moderation Tools** — Wardens: remove drops/replies, pin, lock threads, ban members from hub, report queue, mod log; Overseers: site-wide user/hub management, global report queue
- **Search** — full-text search across drops, hubs, and users (Postgres FTS)
- **Discovery** — explore/trending hub directory, recommended hubs
- **Notifications** — @mention alerts, unread counts
- **Auth** — email/password + OAuth (GitHub / Google) via Auth.js; httpOnly sessions; rate-limited login

---

## Tech Stack

| Technology | Version | Role |
|---|---|---|
| **Next.js** | 14 | Full-stack framework — App Router, server components, API routes |
| **TypeScript** | 5.5 | End-to-end type safety; strict mode + `noUncheckedIndexedAccess` |
| **PostgreSQL** | 16 | Primary relational database |
| **Prisma** | 7 | ORM — schema-first, typed query builder, migrations, seed script |
| **Redis** | 7 | Vote tally caching, feed ranking, session store |
| **MinIO / S3** | — | S3-compatible object storage for images and videos (MinIO in dev) |
| **Auth.js (NextAuth)** | v5 | Authentication — email/password + OAuth; httpOnly session cookies |
| **Tailwind CSS** | 3 | Utility-first styling; custom "Heat" brand palette; dark/light themes |
| **Zod** | 4 | Runtime environment validation; all env vars typed and checked at startup |
| **pino** | 10 | Structured JSON logging (pino-pretty for dev, newline-delimited JSON in prod) |
| **ioredis** | 5 | Redis client with full TypeScript support |
| **Vitest** | 2 | Unit and integration tests |
| **Docker Compose** | — | Local dev stack: Postgres + Redis + MinIO in one command |

---

## Architecture Overview

PostUp is a Next.js 14 App Router application where all data-fetching pages are React Server Components — no client-side waterfall fetches for initial renders. The Prisma client is a process-level singleton (safe across Next.js hot-reloads) backed by PostgreSQL 16 via the `@prisma/adapter-pg` driver adapter. Redis (ioredis) caches vote tallies and ranked feed pages, with a graceful-degradation pattern so a Redis miss falls through to Postgres without crashing. Media uploads (images, videos) are streamed directly to MinIO (or any S3-compatible bucket in production) — the app never stores binary data in Postgres. All required environment variables are validated at startup through a single Zod schema in `src/lib/env.ts`; missing or malformed config throws a descriptive error before the server accepts traffic.

---

## Getting Started

### Prerequisites

- **Node.js** 20+ (`node --version`)
- **Docker** and **Docker Compose** (`docker --version`)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/oppressedturtle/postup.git
cd postup

# 2. Copy the example env file and fill in your values
cp .env.example .env
# Edit .env — defaults work out of the box for local Docker dev

# 3. Start Postgres, Redis, and MinIO
npm run docker:up
# Waits for healthchecks; containers are ready when 'docker:up' exits

# 4. Install dependencies
npm install

# 5. Run the initial database migration
npm run db:migrate
# Prompts for a migration name (e.g. "init")

# 6. Seed the database with demo data
npm run db:seed
# Creates 2 users, 2 hubs, and sample drops

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
| `lint` | `next lint` | ESLint — `next/core-web-vitals` + Prettier rules |
| `typecheck` | `tsc --noEmit` | TypeScript type-check with no emit |
| `format` | `prettier --check` | Check formatting across `src/**` |
| `format:write` | `prettier --write` | Auto-fix formatting |
| `test` | `vitest run` | Run all tests once (CI mode) |
| `db:generate` | `prisma generate` | Re-generate Prisma Client after schema changes |
| `db:migrate` | `prisma migrate dev` | Create and apply a new migration |
| `db:seed` | `prisma db seed` | Run the seed script (`prisma/seed.ts`) |
| `db:studio` | `prisma studio` | Open Prisma Studio GUI at localhost:5555 |
| `docker:up` | `docker compose up -d` | Start Postgres, Redis, MinIO in the background |
| `docker:down` | `docker compose down` | Stop and remove containers |
| `docker:logs` | `docker compose logs -f` | Tail all container logs |

---

## Project Status

**Phase 0 — Foundation: complete (5/5)**

See [`ROADMAP.md`](./ROADMAP.md) for the full build plan across 10 phases and [`PROGRESS.md`](./PROGRESS.md) for the detailed daily log.

**Up next:** Phase 1 — Auth (Auth.js email/password + OAuth, User model, profile pages)

---

## License

MIT — Yanis (oppressedturtle)
