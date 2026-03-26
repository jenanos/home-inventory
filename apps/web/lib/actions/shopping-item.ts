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
