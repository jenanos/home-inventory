import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Next.js treats every export of a `"use server"` module as a server action.
 * Re-export statements — even `export type { X }` — survive into the compiled
 * module as value exports, so the whole module throws `X is not defined` when
 * it loads and every action in it fails at runtime. Type checking and unit
 * tests do not catch this; only a running production build does.
 */
const ACTIONS_DIR = join(__dirname)

const files = readdirSync(ACTIONS_DIR).filter(
  (file) => file.endsWith(".ts") && !file.endsWith(".test.ts")
)

describe('"use server" modules', () => {
  it.each(files)("%s exports only declarations", (file) => {
    const source = readFileSync(join(ACTIONS_DIR, file), "utf8")
    if (!/^["']use server["']/.test(source.trimStart())) return

    const offending = source
      .split("\n")
      .filter((line) => /^export\s+(type\s+)?(\{|\*)/.test(line))

    expect(offending).toEqual([])
  })
})
