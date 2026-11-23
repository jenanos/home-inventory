import { describe, expect, it } from "vitest"

import {
  DEFAULT_QUICK_NAV_PAGES,
  MAX_QUICK_NAV_PAGES,
  resolveQuickNavPages,
} from "./quick-nav"

describe("resolveQuickNavPages", () => {
  it("falls back to the default when nothing is stored", () => {
    expect(resolveQuickNavPages([])).toEqual(DEFAULT_QUICK_NAV_PAGES)
    expect(resolveQuickNavPages(null)).toEqual(DEFAULT_QUICK_NAV_PAGES)
  })

  it("keeps the stored order and drops unknown and repeated pages", () => {
    expect(
      resolveQuickNavPages(["packing", "removed-page", "packing", "overview"])
    ).toEqual(["packing", "overview"])
  })

  it("never shows more than fit next to Mer", () => {
    expect(
      resolveQuickNavPages([
        "overview",
        "lists",
        "projects",
        "budget",
        "garden",
      ])
    ).toHaveLength(MAX_QUICK_NAV_PAGES)
  })
})
