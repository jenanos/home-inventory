# Home Overview

A personal app for managing home projects and finances, built with Next.js 16 and PostgreSQL.

## Features

- **Shopping lists** — create and organize multiple lists per household
- **Item tracking** — priority, timeframe (now, soon, later, someday), due dates, estimated prices, store names, product URLs and product alternatives
- **Categories** — 13 default categories with icons and colors, fully customizable
- **Multi-user households** — invite members and assign items
- **Shared links** — generate shareable links to lists with optional expiration
- **Projects** — maintenance, repairs, renovations and other home projects, with checklist steps, optional vendor quotes and linked shopping lists
- **MCP server** — an OAuth-protected MCP endpoint (`/api/mcp`) lets AI assistants read and update shopping lists, budget, projects and garden
- **Authentication** — magic link email login via Resend
- **Dark mode** — toggle with the `d` hotkey in dev

## Tech Stack

- **Next.js 16** with React 19, App Router, and Server Components
- **Tailwind CSS 4** with shadcn/ui components
- **PostgreSQL** with Prisma ORM
- **Auth.js** (NextAuth v5) for authentication
- **Turborepo** + pnpm monorepo

## Project Structure

```
apps/web            → Next.js application
packages/db         → Prisma schema, migrations, and seed
packages/ui         → Shared shadcn/ui component library
packages/eslint-config      → Shared ESLint configs
packages/typescript-config  → Shared TypeScript configs
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL

### Setup

1. Clone the repo and install dependencies:

   ```bash
   pnpm install
   ```

2. Copy `.env.example` to `.env` and fill in values:

   ```bash
   cp .env.example .env
   ```

   Required variables: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`

3. Run database migrations and seed:

   ```bash
   docker compose up -d
   pnpm db:setup
   ```

4. Start the dev server:

   ```bash
   pnpm dev
   ```

## Scripts

```bash
pnpm dev          # Start dev server with Turbopack
pnpm build        # Production build
pnpm db:generate  # Generate Prisma client
pnpm db:migrate   # Run Prisma migrations locally
pnpm db:setup     # Start from a fresh local DB schema + seed
pnpm db:seed      # Seed demo data into an existing schema
pnpm db:test:prepare # Start isolated test DB and apply all migrations
pnpm lint         # ESLint across all workspaces
pnpm format       # Prettier across all workspaces
pnpm test         # Run Vitest across all workspaces
pnpm typecheck    # TypeScript type checking
```

## Adding UI Components

Use the shadcn CLI to add new components:

```bash
pnpm dlx shadcn@latest add <component-name> -c packages/ui
```

Components are installed to `packages/ui/src/components/` and imported via `@workspace/ui`.

```tsx
import { Button } from "@workspace/ui/components/button"
```

## Deployment

The app is containerized with a multi-stage Dockerfile. GitHub Actions builds and pushes the image to `ghcr.io` on push to `main`.

Production stack:

- Docker Compose with PostgreSQL
- Caddy for TLS and reverse proxy
- Watchtower for automatic image updates
- Prisma migrations run automatically on container startup
