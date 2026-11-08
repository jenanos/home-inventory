"use server"

import type { ItemStatus, Priority, Timeframe } from "@workspace/db"
import {
  createShoppingItem as createShoppingItemService,
  deleteShoppingItem as deleteShoppingItemService,
  toggleShoppingItemPurchased,
  updateShoppingItem as updateShoppingItemService,
  type ProductAlternativeFields,
  type ShoppingItemResult,
} from "@/lib/application/shopping/write"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

// Thin adapters over the shopping write services. Items are always
// reached through their list's visibility rule, so private lists stay private.

/** Server actions cannot return `Decimal`; the browser gets plain numbers. */
function toClientItem(item: ShoppingItemResult) {
  return {
    ...item,
    estimatedPrice: item.estimatedPrice ? item.estimatedPrice.toNumber() : null,
    alternatives: item.alternatives.map((alternative) => ({
      ...alternative,
      price: alternative.price ? alternative.price.toNumber() : null,
    })),
  }
}

interface CreateItemInput {
  name: string
  description?: string
  categoryId?: string
  priority?: Priority
  timeframe?: Timeframe
  dueDate?: Date
  estimatedPrice?: number
  url?: string
  storeName?: string
  assignedToId?: string
  listId: string
  alternatives?: ProductAlternativeFields[]
}

export async function createShoppingItem(input: CreateItemInput) {
  const { context } = await requireHousehold()
  const item = await createShoppingItemService(context, input)

  revalidatePath(`/lists/${input.listId}`)
  return toClientItem(item)
}

interface UpdateItemInput {
  id: string
  name?: string
  description?: string | null
  categoryId?: string | null
  priority?: Priority
  timeframe?: Timeframe | null
  dueDate?: Date | null
  estimatedPrice?: number | null
  url?: string | null
  storeName?: string | null
  assignedToId?: string | null
  status?: ItemStatus
}

export async function updateShoppingItem(input: UpdateItemInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const updated = await updateShoppingItemService(context, id, fields)

  revalidatePath(`/lists/${updated.listId}`)
  return toClientItem(updated)
}

export async function deleteShoppingItem(itemId: string) {
  const { context } = await requireHousehold()
  const { listId } = await deleteShoppingItemService(context, itemId)

  revalidatePath(`/lists/${listId}`)
}

export async function toggleItemPurchased(itemId: string) {
  const { context } = await requireHousehold()
  const item = await toggleShoppingItemPurchased(context, itemId)

  revalidatePath(`/lists/${item.listId}`)
}
