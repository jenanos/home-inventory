import type { ShoppingItemData } from "@/lib/shopping-item-view"

/** The list page's URL filters (`list-filters.tsx`), shared by list and board. */
export function filterShoppingItems(
  items: ShoppingItemData[],
  params: { get(name: string): string | null }
): ShoppingItemData[] {
  const category = params.get("category")
  const priority = params.get("priority")
  const assigned = params.get("assigned")
  const status = params.get("status")

  return items.filter(
    (item) =>
      (!category || item.category?.id === category) &&
      (!priority || item.priority === priority) &&
      (!assigned || item.assignedTo?.id === assigned) &&
      (!status || item.status === status)
  )
}
