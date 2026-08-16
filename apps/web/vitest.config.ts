import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/**
 * Mirrors the `@/*` path alias from tsconfig.json so tests can import route
 * handlers and application modules exactly as the app does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
})
