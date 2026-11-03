"use server"

import { db, type ItemStatus, type Phase, type Priority } from "@workspace/db"
import { assertBatchSize, notFound } from "@/lib/application/mutations"
import {
  assertCategoryMapInHousehold,
  bulkCreateShoppingItems as bulkCreateShoppingItemsService,
  bulkImportShoppingItemsWithDuplicates as bulkImportWithDuplicatesService,
  findExistingShoppingItems as findExistingShoppingItemsService,
  toNewShoppingItem,
  type ExistingShoppingItem,
  type ImportItemFieldUpdate,
  type ImportItemInput,
} from "@/lib/application/shopping/import"
import {
  createShoppingItem as createShoppingItemService,
  deleteShoppingItem as deleteShoppingItemService,
  insertShoppingItems,
  toggleShoppingItemPurchased,
  updateShoppingItem as updateShoppingItemService,
  type ProductAlternativeFields,
  type ShoppingItemResult,
} from "@/lib/application/shopping/write"
import { requireHousehold } from "@/lib/session"
import { getVisibleShoppingListsWhere } from "@/lib/shopping-list-access"
import { revalidatePath } from "next/cache"

// Thin adapters over the shopping write and import services. Items are always
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
  phase?: Phase
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
  phase?: Phase | null
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

// ─── LLM import ─────────────────────────────────────────────────

interface BulkCreateInput {
  items: ImportItemInput[]
  listId: string
  categoryMap: Record<string, string> // categoryName -> categoryId
}

export async function bulkCreateShoppingItems(input: BulkCreateInput) {
  const { context } = await requireHousehold()
  const result = await bulkCreateShoppingItemsService(context, input)

  revalidatePath(`/lists/${input.listId}`)
  return result
}

/**
 * Full replace stays a web-only action outside the application layer, so no
 * MCP tool can ever reach it (plan 10.4). It shares the import's boundary
 * checks: the list must be visible and every category id the household's.
 */
export async function replaceShoppingItems(input: BulkCreateInput) {
  const { context } = await requireHousehold()
  assertBatchSize(input.items.length, "Varer", { allowEmpty: true })

  await db.$transaction(
    async (tx) => {
      const list = await tx.shoppingList.findFirst({
        where: {
          ...getVisibleShoppingListsWhere(context.householdId, context.userId),
          id: input.listId,
        },
        select: { id: true },
      })
      if (!list) throw notFound("handleliste")

      await assertCategoryMapInHousehold(tx, context, input.categoryMap)
      await tx.shoppingItem.deleteMany({ where: { listId: input.listId } })

      if (input.items.length > 0) {
        await insertShoppingItems(
          tx,
          context,
          input.listId,
          input.items.map((item) => toNewShoppingItem(item, input.categoryMap)),
          { onDuplicate: "create" }
        )
      }
    },
    { timeout: 30_000, maxWait: 5_000 }
  )

  revalidatePath(`/lists/${input.listId}`)
  return { count: input.items.length }
}

export async function findExistingShoppingItems(
  listId: string,
  names: string[]
): Promise<ExistingShoppingItem[]> {
  const { context } = await requireHousehold()
  return findExistingShoppingItemsService(context, listId, names)
}

interface BulkImportShoppingItemsWithDuplicatesInput {
  newItems: ImportItemInput[]
  updates: ImportItemFieldUpdate[]
  listId: string
  categoryMap: Record<string, string>
}

export async function bulkImportShoppingItemsWithDuplicates(
  input: BulkImportShoppingItemsWithDuplicatesInput
) {
  const { context } = await requireHousehold()
  const result = await bulkImportWithDuplicatesService(context, input)

  revalidatePath(`/lists/${input.listId}`)
  return result
}
