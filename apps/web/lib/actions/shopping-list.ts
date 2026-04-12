"use server"

import { db } from "@workspace/db"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

export async function createShoppingList(name: string) {
  const { membership } = await requireHousehold()

  const list = await db.shoppingList.create({
    data: {
      name,
      householdId: membership.householdId,
    },
  })

  revalidatePath("/")
  revalidatePath("/lists")
  return list
}

export async function updateShoppingList(listId: string, name: string) {
  const { membership } = await requireHousehold()

  const list = await db.shoppingList.findUnique({ where: { id: listId } })
  if (!list || list.householdId !== membership.householdId) {
    throw new Error("List not found")
  }

  await db.shoppingList.update({
    where: { id: listId },
    data: { name },
  })

  revalidatePath(`/lists/${listId}`)
  revalidatePath("/lists")
  revalidatePath("/")
}

export async function deleteShoppingList(listId: string) {
  const { membership } = await requireHousehold()

  const list = await db.shoppingList.findUnique({ where: { id: listId } })
  if (!list || list.householdId !== membership.householdId) {
    throw new Error("List not found")
  }

  await db.shoppingList.delete({ where: { id: listId } })

  revalidatePath("/lists")
  revalidatePath("/")
}
