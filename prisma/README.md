# Prisma Migration Strategy

## Development

```bash
npm run db:migrate
# Alias for: prisma migrate dev
```

Creates a new timestamped migration file under `prisma/migrations/` and applies it to the development database. Run this whenever you change `schema.prisma`. Always commit the generated migration files — they are the source of truth for the schema history.

## Production

```bash
npx prisma migrate deploy
# or: npm run migrate:prod
```

Applies all pending migration files from `prisma/migrations/` to the production database. Never creates new migration files — read-only with respect to the migration history. This is the command run automatically in the Docker entrypoint (`scripts/entrypoint.sh`) before the app starts on every deploy.

**Never run `prisma migrate dev` in production.** It can prompt interactively, shadow-database operations may fail, and it may generate unexpected migration files.

## Rollback

Prisma has no built-in rollback command. To reverse a migration:

1. Write a "down" SQL file manually (e.g. `prisma/migrations/YYYYMMDDHHMMSS_revert_<name>/migration.sql`).
2. Apply it directly:
   ```bash
   # With psql
   psql "$DATABASE_URL" -f path/to/down.sql
   ```
3. Update `_prisma_migrations` to mark the original migration as rolled back, or use `prisma migrate resolve --rolled-back <migration_name>` so Prisma no longer considers it applied.
4. Create a new Prisma migration that puts the schema back to the desired state:
   ```bash
   npm run db:migrate  # generates + applies the corrective migration
   ```

Keep down-migration SQL in a separate directory (e.g. `prisma/rollbacks/`) — do not place them in `prisma/migrations/` as Prisma will try to apply them.

## Seeding

```bash
npm run db:seed
# Alias for: prisma db seed (runs prisma/seed.ts via ts-node)
```

Seeds development and staging databases with a set of known users, hubs, and drops for manual testing. **Never run the seed in production** — it uses hardcoded credentials and will insert test data into your live database.

## CI

The GitHub Actions workflow runs `prisma migrate deploy` as part of the Docker build step verification. In the running container, `scripts/entrypoint.sh` ensures migrations are applied before the Next.js server starts, so schema and code are always in sync on every deploy.

## Checklist before merging a schema change

- [ ] `prisma migrate dev` generated a migration file locally
- [ ] Migration file is committed in the PR
- [ ] `prisma generate` ran and the generated client compiles (`tsc --noEmit`)
- [ ] Tests still pass (`npm test`)
- [ ] The migration is backwards-compatible with the currently deployed code (no column drops or renames without a multi-step migration strategy)
