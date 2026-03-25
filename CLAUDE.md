# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
pnpm dev          # Start Next.js dev server with Turbopack
pnpm build        # Production build (via Turbo)
pnpm lint         # ESLint across all workspaces
pnpm format       # Prettier across all workspaces
pnpm typecheck    # TypeScript type checking (tsc --noEmit)
```

All commands are orchestrated by Turbo. No test framework is configured yet.

## Architecture

This is a **pnpm monorepo** managed by Turborepo with two workspace roots:

- **`apps/web`** — Next.js 16 application (the main app)
- **`packages/ui`** — Shared React component library (shadcn/ui + Radix UI)
- **`packages/eslint-config`** — Shared ESLint configurations (base, next, react-internal)
- **`packages/typescript-config`** — Shared TypeScript configs (base, nextjs, react-library)

Cross-package imports use the `@workspace/` alias (e.g., `@workspace/ui`).

## UI & Styling

- **shadcn/ui** components built on Radix UI primitives, using CVA for variants
- **Tailwind CSS 4** with oklch() theme variables defined in `packages/ui/src/styles/globals.css`
- Dark mode via `next-themes` (toggle with 'd' hotkey in dev)
- `cn()` utility in `packages/ui/src/lib/utils.ts` (clsx + tailwind-merge)
- Prettier sorts Tailwind classes automatically (configured with `prettier-plugin-tailwindcss`)

## Adding shadcn Components

shadcn config lives in `packages/ui/components.json`. New components go in `packages/ui/src/components/` and are exported from `packages/ui/package.json`.
