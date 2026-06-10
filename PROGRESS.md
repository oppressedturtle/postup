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
