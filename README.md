# PostUp 🚀

A modern, production-grade community platform — create **Hubs**, share **Drops**, and rise on **The Stream**. Think forums reimagined: communities, threaded discussion, voting, rich media, and real moderation.

> Portfolio project — work in progress. Built incrementally, the honest way.

## The PostUp Lexicon
| PostUp | Means |
| --- | --- |
| **Hub** (`h/name`) | A community |
| **Drop** | A post — text, image, video, or link |
| **Boost / Bury** | Upvote / downvote |
| **Heat** | A drop's net score |
| **Clout** | Your reputation |
| **Warden** | Hub moderator |
| **Overseer** | Site admin |
| **The Stream** | Your personalized home feed |
| **Stash** | Saved drops |

## Features
- **Hubs** — create communities, set rules/banner/icon, join/leave, role-based membership
- **Drops** — post text (markdown), images, **videos (played in-app)**, or links with **rich Open Graph previews**
- **Embeds** — YouTube/Vimeo/etc. play inline via oEmbed
- **Voting** — Boost/Bury with Hot · Rising · Fresh · Top ranking
- **Replies** — fully threaded comments, votable, with @mentions
- **Moderation** — Wardens moderate hubs (remove/pin/lock/ban, report queue, mod log); Overseers run the site
- **The Stream** — personalized feed from your hubs, Clout-driven reputation, Stash to save

## Stack
Next.js (App Router) · TypeScript · Postgres + Prisma · Redis · Tailwind · S3-compatible media (MinIO in dev) · Docker · GitHub Actions CI

## Status
See [`ROADMAP.md`](./ROADMAP.md) for the build plan and [`PROGRESS.md`](./PROGRESS.md) for the daily log.

## License
MIT — see [`LICENSE`](./LICENSE).
