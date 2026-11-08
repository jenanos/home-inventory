/**
 * Pure helpers for what a project's shopping lists amount to. Kept free of the
 * database client so client and server components can both use them.
 */

type SummaryItem = {
  status: string
  estimatedPrice: { toString(): string } | null
  alternatives: Array<{ price: { toString(): string } | null }>
}

function effectivePrice(item: SummaryItem) {
  if (item.estimatedPrice != null) return Number(item.estimatedPrice)
  const first = item.alternatives[0]?.price
  return first != null ? Number(first) : 0
}

/**
 * What a linked list amounts to: skipped items count for nothing, and an
 * item's price is its own estimate or else its first alternative's price, as
 * on the list page.
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
