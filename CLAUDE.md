This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

Home Overview — a personal app for managing home projects and finances.

## Build & Development Commands

```bash
pnpm dev          # Start Next.js dev server with Turbopack
pnpm build        # Production build (via Turbo)
pnpm lint         # ESLint across all workspaces
pnpm format       # Prettier across all workspaces
pnpm typecheck    # TypeScript type checking (tsc --noEmit)
```

All commands are orchestrated by Turbo. No test framework is configured yet.

## Local Development

- Start database: `docker compose up -d`
- Stop database: `docker compose down`
- Reset database: `docker compose down -v` (sletter all data)
- Run migrations: `pnpm db:migrate`
- Setup database + seed: `pnpm db:setup`

## Architecture

This is a **pnpm monorepo** managed by Turborepo with two workspace roots:

- **`apps/web`** — Next.js 16 application (the main app)
- **`packages/ui`** — Shared React component library (shadcn/ui + Radix UI)
- **`packages/eslint-config`** — Shared ESLint configurations (base, next, react-internal)
- **`packages/typescript-config`** — Shared TypeScript configs (base, nextjs, react-library)

Cross-package imports use the `@workspace/` alias (e.g., `@workspace/ui`).

## Database

- PostgreSQL with Prisma ORM
- Prisma schema and client in `packages/db` (create this package when setting up)
- Use `@workspace/db` for imports across the monorepo
- Run migrations: `pnpm db:migrate`
- Always create migrations for schema changes, don't use db push in development

## UI & Styling

- **shadcn/ui** components built on Radix UI primitives, using CVA for variants
- **Tailwind CSS 4** with oklch() theme variables defined in `packages/ui/src/styles/globals.css`
- Dark mode via `next-themes` (toggle with 'd' hotkey in dev)
- `cn()` utility in `packages/ui/src/lib/utils.ts` (clsx + tailwind-merge)
- Prettier sorts Tailwind classes automatically (configured with `prettier-plugin-tailwindcss`)

## Adding shadcn Components — IMPORTANT

shadcn config lives in `packages/ui/components.json`.

To add new components, ALWAYS use the CLI:

```bash
pnpm dlx shadcn@latest add <component-name> -c packages/ui
```

NEVER manually create shadcn components. The CLI handles dependencies, correct file paths, and theme variable integration.

Components are installed to `packages/ui/src/components/` and must be exported from `packages/ui/package.json`.

When a new component is needed in the app, first check if it already exists in packages/ui/src/components/ before adding it.

Reference: https://ui.shadcn.com/docs/monorepo

## Production Deployment

- Image bygges automatisk av GitHub Actions ved push til main
- Image: ghcr.io/jenanos/home-overview:main
- Serveren kjører Docker Compose med Postgres som separat container
- Caddy håndterer TLS og reverse proxy
- Watchtower auto-puller nye images hvert 5. minutt
- Prisma-migrasjoner kjøres automatisk ved container-oppstart

## Code Conventions

- TypeScript everywhere, avoid `any` — use proper types
- Next.js Server Components by default, add "use client" only when needed
- Server Actions for mutations, not API routes (unless there's a specific reason)
- Use subagents/subtasks for large multi-step work
- After completing a feature or significant change, run `pnpm build` to verify everything compiles
- Keep components small and composable
