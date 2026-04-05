# Home Inventory

A personal app for managing household purchases and shopping lists, built with Next.js 16 and PostgreSQL.

## Features

- **Shopping lists** — create and organize multiple lists per household
- **Item tracking** — priority, phase (before move, first week, etc.), due dates, estimated prices, store names, and product URLs
- **Categories** — 13 default categories with icons and colors, fully customizable
- **Multi-user households** — invite members and assign items
- **Shared links** — generate shareable links to lists with optional expiration
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
pnpm lint         # ESLint across all workspaces
pnpm format       # Prettier across all workspaces
pnpm typecheck    # TypeScript type checking
```

## Adding UI Components

Use the shadcn CLI to add new components:

```bash
pnpm dlx shadcn@latest add <component-name> -c packages/ui
```

Components are installed to `packages/ui/src/components/` and imported via `@workspace/ui`.

```tsx
import { Button } from "@workspace/ui/components/button";
```

## Deployment

The app is containerized with a multi-stage Dockerfile. GitHub Actions builds and pushes the image to `ghcr.io` on push to `main`.

Production stack:
- Docker Compose with PostgreSQL
- Caddy for TLS and reverse proxy
- Watchtower for automatic image updates
- Prisma migrations run automatically on container startup
