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
