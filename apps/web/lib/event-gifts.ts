import { summarizeShoppingList } from "@/lib/project-purchases"

type GiftListItems = {
  items: Parameters<typeof summarizeShoppingList>[0]
}

/** All gift wishes of an event across its visible lists, as one summary. */
export function summarizeGifts(lists: GiftListItems[]) {
  return summarizeShoppingList(lists.flatMap((list) => list.items))
}

export type GiftSummary = ReturnType<typeof summarizeGifts>

/** "2/3 gaver kjøpt", "Alle 3 gaver kjøpt", or null without wishes. */
export function describeGifts(
  summary: Pick<GiftSummary, "itemCount" | "purchasedCount">
) {
  if (summary.itemCount === 0) return null
  if (summary.purchasedCount === summary.itemCount) {
    return summary.itemCount === 1
      ? "Gaven er kjøpt"
      : `Alle ${summary.itemCount} gaver kjøpt`
  }
  return `${summary.purchasedCount}/${summary.itemCount} gaver kjøpt`
}
