#!/bin/sh
# PostUp container entrypoint
# Runs Prisma migrations before starting the Next.js standalone server.
# Using `prisma migrate deploy` (not `migrate dev`) — applies existing migration
# files only, never generates new ones. Safe to run on every container start.
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Starting application..."
exec node server.js
