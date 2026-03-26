# ── Stage 1: Dependencies ────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/ui/package.json ./packages/ui/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Builder ─────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY --from=deps /app/ ./
COPY . .

# Ensure public dir exists (Next.js standalone expects it)
RUN mkdir -p apps/web/public

RUN pnpm --filter @workspace/db prisma generate
RUN pnpm build --filter web

# ── Stage 3: Runner ──────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy Next.js standalone output (includes node_modules with traced deps)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copy Prisma schema and migrations for migrate deploy
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma

# Install prisma CLI for runtime migrations
RUN npm install -g prisma@6

# Copy start script
COPY start.sh ./start.sh
RUN chmod +x start.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./start.sh"]
