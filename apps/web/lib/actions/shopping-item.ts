"use server"

import { db, type Priority, type Phase, type ItemStatus } from "@workspace/db"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

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
}

export async function createShoppingItem(input: CreateItemInput) {
  const { membership } = await requireHousehold()

  const list = await db.shoppingList.findUnique({
    where: { id: input.listId },
  })
  if (!list || list.householdId !== membership.householdId) {
    throw new Error("List not found")
  }

  const item = await db.shoppingItem.create({
    data: {
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      priority: input.priority ?? "MEDIUM",
      phase: input.phase,
      dueDate: input.dueDate,
      estimatedPrice: input.estimatedPrice,
      url: input.url,
      storeName: input.storeName,
      assignedToId: input.assignedToId,
      listId: input.listId,
    },
  })

  revalidatePath(`/lists/${input.listId}`)
  return { ...item, estimatedPrice: item.estimatedPrice ? Number(item.estimatedPrice) : null }
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
  const { membership } = await requireHousehold()

  const item = await db.shoppingItem.findUnique({
    where: { id: input.id },
    include: { list: true },
  })
  if (!item || item.list.householdId !== membership.householdId) {
    throw new Error("Item not found")
  }

  const { id, ...data } = input
  const updated = await db.shoppingItem.update({
    where: { id },
    data: {
      ...data,
      purchasedAt:
        input.status === "PURCHASED" && item.status !== "PURCHASED"
          ? new Date()
          : input.status !== "PURCHASED"
            ? null
            : undefined,
    },
  })

  revalidatePath(`/lists/${item.listId}`)
  return { ...updated, estimatedPrice: updated.estimatedPrice ? Number(updated.estimatedPrice) : null }
}

export async function deleteShoppingItem(itemId: string) {
  const { membership } = await requireHousehold()

  const item = await db.shoppingItem.findUnique({
    where: { id: itemId },
    include: { list: true },
  })
  if (!item || item.list.householdId !== membership.householdId) {
    throw new Error("Item not found")
  }

  await db.shoppingItem.delete({ where: { id: itemId } })

  revalidatePath(`/lists/${item.listId}`)
}

interface BulkCreateAlternativeInput {
  name: string
  price?: number
  url?: string
  imageUrl?: string
  storeName?: string
  notes?: string
}

interface BulkCreateItemInput {
  name: string
  description?: string
  categoryName?: string
  priority?: Priority
  phase?: Phase
  estimatedPrice?: number
  url?: string
  imageUrl?: string
  storeName?: string
  alternatives?: BulkCreateAlternativeInput[]
}

interface BulkCreateInput {
  items: BulkCreateItemInput[]
  listId: string
  categoryMap: Record<string, string> // categoryName -> categoryId
}

export async function bulkCreateShoppingItems(input: BulkCreateInput) {
  const { membership } = await requireHousehold()

  const list = await db.shoppingList.findUnique({
    where: { id: input.listId },
  })
  if (!list || list.householdId !== membership.householdId) {
    throw new Error("List not found")
  }

  const validPriorities = new Set(["HIGH", "MEDIUM", "LOW"])
  const validPhases = new Set(["BEFORE_MOVE", "FIRST_WEEK", "CAN_WAIT", "NO_RUSH"])

  const results = await db.$transaction(
    input.items.map((item) =>
      db.shoppingItem.create({
        data: {
          name: item.name,
          description: item.description || undefined,
          categoryId: item.categoryName ? input.categoryMap[item.categoryName] ?? undefined : undefined,
          priority: (item.priority && validPriorities.has(item.priority) ? item.priority : "MEDIUM") as Priority,
          phase: (item.phase && validPhases.has(item.phase) ? item.phase : undefined) as Phase | undefined,
          estimatedPrice: item.estimatedPrice ?? undefined,
          url: item.url || undefined,
          imageUrl: item.imageUrl || undefined,
          storeName: item.storeName || undefined,
          listId: input.listId,
          alternatives: item.alternatives && item.alternatives.length > 0
            ? {
                create: item.alternatives.map((alt, index) => ({
                  name: alt.name,
                  price: alt.price ?? undefined,
                  url: alt.url || undefined,
                  imageUrl: alt.imageUrl || undefined,
                  storeName: alt.storeName || undefined,
                  notes: alt.notes || undefined,
                  rank: index,
                })),
              }
            : undefined,
        },
      })
    )
  )

  revalidatePath(`/lists/${input.listId}`)
  return { count: results.length }
}

// ─── Duplicate Detection ────────────────────────────────────────

export interface ExistingShoppingItem {
  id: string
  name: string
  description: string | null
  categoryId: string | null
  priority: string
  phase: string | null
  estimatedPrice: number | null
  url: string | null
  imageUrl: string | null
  storeName: string | null
  alternativeCount: number
}

export async function findExistingShoppingItems(
  listId: string,
  names: string[]
): Promise<ExistingShoppingItem[]> {
  const { membership } = await requireHousehold()

  const list = await db.shoppingList.findUnique({
    where: { id: listId },
  })
  if (!list || list.householdId !== membership.householdId) {
    throw new Error("List not found")
  }

  const lowerNames = names.map((n) => n.toLowerCase())

  const existing = await db.shoppingItem.findMany({
    where: { listId },
    include: {
      _count: { select: { alternatives: true } },
    },
  })

  return existing
    .filter((item) => lowerNames.includes(item.name.toLowerCase()))
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      categoryId: item.categoryId,
      priority: item.priority,
      phase: item.phase,
      estimatedPrice: item.estimatedPrice ? Number(item.estimatedPrice) : null,
      url: item.url,
      imageUrl: item.imageUrl,
      storeName: item.storeName,
      alternativeCount: item._count.alternatives,
    }))
}

// ─── Bulk Import With Duplicate Handling ────────────────────────

interface ShoppingItemFieldUpdate {
  id: string
  fields: {
    description?: string
    categoryId?: string | null
    priority?: Priority
    phase?: Phase | null
    estimatedPrice?: number
    url?: string
    imageUrl?: string
    storeName?: string
  }
}

interface BulkImportShoppingItemsWithDuplicatesInput {
  newItems: BulkCreateItemInput[]
  updates: ShoppingItemFieldUpdate[]
  listId: string
  categoryMap: Record<string, string>
}

export async function bulkImportShoppingItemsWithDuplicates(
  input: BulkImportShoppingItemsWithDuplicatesInput
) {
  const { membership } = await requireHousehold()

  const list = await db.shoppingList.findUnique({
    where: { id: input.listId },
  })
  if (!list || list.householdId !== membership.householdId) {
    throw new Error("List not found")
  }

  const validPriorities = new Set(["HIGH", "MEDIUM", "LOW"])
  const validPhases = new Set(["BEFORE_MOVE", "FIRST_WEEK", "CAN_WAIT", "NO_RUSH"])
  let count = 0

  // Create new items
  if (input.newItems.length > 0) {
    const results = await db.$transaction(
      input.newItems.map((item) =>
        db.shoppingItem.create({
          data: {
            name: item.name,
            description: item.description || undefined,
            categoryId: item.categoryName ? input.categoryMap[item.categoryName] ?? undefined : undefined,
            priority: (item.priority && validPriorities.has(item.priority) ? item.priority : "MEDIUM") as Priority,
            phase: (item.phase && validPhases.has(item.phase) ? item.phase : undefined) as Phase | undefined,
            estimatedPrice: item.estimatedPrice ?? undefined,
            url: item.url || undefined,
            imageUrl: item.imageUrl || undefined,
            storeName: item.storeName || undefined,
            listId: input.listId,
            alternatives: item.alternatives && item.alternatives.length > 0
              ? {
                  create: item.alternatives.map((alt, index) => ({
                    name: alt.name,
                    price: alt.price ?? undefined,
                    url: alt.url || undefined,
                    imageUrl: alt.imageUrl || undefined,
                    storeName: alt.storeName || undefined,
                    notes: alt.notes || undefined,
                    rank: index,
                  })),
                }
              : undefined,
          },
        })
      )
    )
    count += results.length
  }

  // Update existing items with selected fields
  if (input.updates.length > 0) {
    const updateOps = input.updates.map((update) => {
      const data: {
        description?: string
        categoryId?: string | null
        priority?: Priority
        phase?: Phase | null
        estimatedPrice?: number
        url?: string
        imageUrl?: string
        storeName?: string
      } = {}
      if (update.fields.description !== undefined) data.description = update.fields.description || undefined
      if (update.fields.categoryId !== undefined) data.categoryId = update.fields.categoryId
      if (update.fields.priority !== undefined) {
        if (validPriorities.has(update.fields.priority)) data.priority = update.fields.priority
      }
      if (update.fields.phase !== undefined) {
        if (update.fields.phase === null || validPhases.has(update.fields.phase)) data.phase = update.fields.phase
      }
      if (update.fields.estimatedPrice !== undefined) data.estimatedPrice = update.fields.estimatedPrice
      if (update.fields.url !== undefined) data.url = update.fields.url || undefined
      if (update.fields.imageUrl !== undefined) data.imageUrl = update.fields.imageUrl || undefined
      if (update.fields.storeName !== undefined) data.storeName = update.fields.storeName || undefined

      return db.shoppingItem.update({
        where: { id: update.id },
        data,
      })
    })

    await db.$transaction(updateOps)
    count += input.updates.length
  }

  revalidatePath(`/lists/${input.listId}`)
  return { count }
}

export async function toggleItemPurchased(itemId: string) {
  const { membership } = await requireHousehold()

  const item = await db.shoppingItem.findUnique({
    where: { id: itemId },
    include: { list: true },
  })
  if (!item || item.list.householdId !== membership.householdId) {
    throw new Error("Item not found")
  }

  const newStatus = item.status === "PURCHASED" ? "PENDING" : "PURCHASED"

  await db.shoppingItem.update({
    where: { id: itemId },
    data: {
      status: newStatus,
      purchasedAt: newStatus === "PURCHASED" ? new Date() : null,
    },
  })

  revalidatePath(`/lists/${item.listId}`)
}
