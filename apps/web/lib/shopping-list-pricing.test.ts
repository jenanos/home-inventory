import { describe, expect, it } from "vitest"

import { getShoppingListItemEffectivePrice } from "./shopping-list-pricing"

describe("getShoppingListItemEffectivePrice", () => {
  it("prefers the top alternative price when present", () => {
    expect(
      getShoppingListItemEffectivePrice({
        estimatedPrice: { toNumber: () => 500 },
        alternatives: [{ price: { toNumber: () => 250 } }],
      })
    ).toBe(250)
  })

  it("falls back to the estimated price when no alternative price exists", () => {
    expect(
      getShoppingListItemEffectivePrice({
        estimatedPrice: { toNumber: () => 500 },
        alternatives: [],
      })
    ).toBe(500)
  })

  it("returns zero when no price information exists", () => {
    expect(
      getShoppingListItemEffectivePrice({
        estimatedPrice: null,
        alternatives: [{ price: null }],
      })
    ).toBe(0)
  })
})
