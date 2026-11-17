"use server"

import {
  clearShoppingItemDeal,
  setDealWatch,
} from "@/lib/application/shopping/deals"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

// Thin adapters over the deal services. Offers show on the list page, the
// shopping overview and the dashboard, so all three are revalidated.

function revalidateDealViews(listId: string) {
  revalidatePath(`/lists/${listId}`)
  revalidatePath("/lists")
  revalidatePath("/")
}

export async function setItemDealWatch(input: {
  itemId: string
  watch: boolean
  note?: string | null
  targetPrice?: number | null
}) {
  const { context } = await requireHousehold()
  const [item] = await setDealWatch(context, [input])

  if (item) revalidateDealViews(item.listId)
  return item
    ? {
        dealWatch: item.dealWatch,
        dealWatchNote: item.dealWatchNote,
        dealTargetPrice: item.dealTargetPrice
          ? item.dealTargetPrice.toNumber()
          : null,
      }
    : null
}

export async function removeItemDeal(itemId: string) {
  const { context } = await requireHousehold()
  const { listId } = await clearShoppingItemDeal(context, itemId)

  revalidateDealViews(listId)
}
