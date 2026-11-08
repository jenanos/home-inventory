/**
 * Pure helpers for what a project's shopping lists amount to. Kept free of the
 * database client so client and server components can both use them.
 */

type SummaryItem = {
  status: string
  estimatedPrice: { toString(): string } | null
  alternatives: Array<{ price: { toString(): string } | null }>
}

/**
 * Same precedence as the list page and `getShoppingListItemEffectivePrice`:
 * the preferred alternative's price, else the item's own estimate.
 */
function effectivePrice(item: SummaryItem) {
  const preferred = item.alternatives[0]?.price
  if (preferred != null) return Number(preferred)
  return item.estimatedPrice != null ? Number(item.estimatedPrice) : 0
}

/**
 * What a linked list amounts to: skipped items count for nothing, and an
 * item's price is its preferred alternative's price or else its own
 * estimate, as on the list page.
 */
export function summarizeShoppingList(items: SummaryItem[]) {
  const counted = items.filter((item) => item.status !== "SKIPPED")
  const purchased = counted.filter((item) => item.status === "PURCHASED")

  return {
    itemCount: counted.length,
    pendingCount: counted.length - purchased.length,
    purchasedCount: purchased.length,
    estimatedTotal: counted.reduce(
      (sum, item) => sum + effectivePrice(item),
      0
    ),
    purchasedTotal: purchased.reduce(
      (sum, item) => sum + effectivePrice(item),
      0
    ),
  }
}

export type ShoppingListSummary = ReturnType<typeof summarizeShoppingList>
