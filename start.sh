#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema=./packages/db/prisma/schema.prisma

if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding database..."
  node packages/db/prisma/seed.js 2>/dev/null || echo "Seed script not available in production image, skipping."
fi

echo "Starting Next.js server..."
exec node apps/web/server.js
