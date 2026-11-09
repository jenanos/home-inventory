import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  COLOR_PALETTE_IDS,
  COLOR_PALETTES,
  DEFAULT_COLOR_PALETTE,
  parseColorPalette,
} from "./color-palettes"

const globalsCss = readFileSync(
  fileURLToPath(
    new URL("../../../packages/ui/src/styles/globals.css", import.meta.url)
  ),
  "utf8"
)

describe("parseColorPalette", () => {
  it("accepts every known palette id", () => {
    for (const id of COLOR_PALETTE_IDS) {
      expect(parseColorPalette(id)).toBe(id)
    }
  })

  it("falls back to the default for missing or unknown values", () => {
    expect(parseColorPalette(undefined)).toBe(DEFAULT_COLOR_PALETTE)
    expect(parseColorPalette(null)).toBe(DEFAULT_COLOR_PALETTE)
    expect(parseColorPalette("")).toBe(DEFAULT_COLOR_PALETTE)
    expect(parseColorPalette("neon")).toBe(DEFAULT_COLOR_PALETTE)
  })
})

describe("COLOR_PALETTES", () => {
  it("lists each id exactly once", () => {
    expect(COLOR_PALETTES.map((p) => p.id)).toEqual([...COLOR_PALETTE_IDS])
  })

  it.each(COLOR_PALETTE_IDS)(
    "%s has light and dark CSS variables in globals.css",
    (id) => {
      expect(globalsCss).toContain(`[data-palette="${id}"] {`)
      expect(globalsCss).toContain(`.dark [data-palette="${id}"]`)
    }
  )
})
