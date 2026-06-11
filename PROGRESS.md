# PostUp — Progress Log

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
