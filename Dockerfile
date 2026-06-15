# PostUp — multi-stage production Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: deps       — install production + dev node_modules
# Stage 2: builder    — generate Prisma client + run Next.js build
# Stage 3: runner     — minimal image with only the standalone output
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# libc6-compat is needed for some native addons on Alpine.
RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci


# ── Stage 2: builder ──────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app

# Copy all source files on top of the already-installed node_modules.
COPY . .

# Provide a placeholder .env so the Zod env validation doesn't fail at
# build time. Real secrets are injected at runtime via env_file / secrets.
COPY .env.example .env

# Generate Prisma Client into src/generated/prisma.
RUN npx prisma generate

# Build the Next.js app (outputs standalone bundle + static assets).
RUN npm run build


# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
# Next.js standalone server binds to 0.0.0.0:3000 by default.
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create a non-root user/group for the process.
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy only what the standalone server needs.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public           ./public

# Prisma Client (generated) and schema (needed for runtime migrations check).
COPY --from=builder --chown=nextjs:nodejs /app/src/generated    ./src/generated
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma

# Entrypoint: runs `prisma migrate deploy` then starts the server.
# Using root temporarily to copy + chmod, then switching to nextjs.
COPY --from=builder /app/scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh && chown nextjs:nodejs entrypoint.sh

USER nextjs

EXPOSE 3000

CMD ["./entrypoint.sh"]
