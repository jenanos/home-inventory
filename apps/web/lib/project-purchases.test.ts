import { describe, expect, it } from "vitest"

import { getShoppingListItemEffectivePrice } from "./shopping-list-pricing"
import { summarizeShoppingList } from "./project-purchases"

function decimal(value: number) {
  return { toString: () => String(value), toNumber: () => value }
}

describe("summarizeShoppingList", () => {
  it("prices an item like the list page: preferred alternative first", () => {
    const item = {
      status: "PURCHASED",
      estimatedPrice: decimal(500),
      alternatives: [{ price: decimal(250) }],
    }

    const summary = summarizeShoppingList([item])

    expect(summary.estimatedTotal).toBe(getShoppingListItemEffectivePrice(item))
    expect(summary).toMatchObject({ estimatedTotal: 250, purchasedTotal: 250 })
  })

  it("falls back to the estimate and leaves skipped items out", () => {
    const summary = summarizeShoppingList([
      { status: "PENDING", estimatedPrice: decimal(120), alternatives: [] },
      {
        status: "PENDING",
        estimatedPrice: decimal(80),
        alternatives: [{ price: null }],
      },
      { status: "SKIPPED", estimatedPrice: decimal(999), alternatives: [] },
    ])

    expect(summary).toEqual({
      itemCount: 2,
      pendingCount: 2,
      purchasedCount: 0,
      estimatedTotal: 200,
      purchasedTotal: 0,
    })
  })
})
