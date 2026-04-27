"use server"

import { db } from "@workspace/db"
import { requireHousehold } from "@/lib/session"
import {
  canManageShoppingListPrivacy,
  isShoppingListAccessible,
} from "@/lib/shopping-list-access"
import { revalidatePath } from "next/cache"

interface CreateShoppingListInput {
  name: string
  isPrivate?: boolean
}

export async function createShoppingList(input: CreateShoppingListInput) {
  const { session, membership } = await requireHousehold()

  const list = await db.shoppingList.create({
    data: {
      name: input.name,
      householdId: membership.householdId,
      createdById: session.user.id,
      isPrivate: input.isPrivate ?? false,
    },
  })

  revalidatePath("/")
  revalidatePath("/lists")
  return list
}

export async function updateShoppingList(listId: string, name: string) {
  const { session, membership } = await requireHousehold()

  const list = await db.shoppingList.findUnique({ where: { id: listId } })
  if (!list) {
    throw new Error("List not found")
  }
  if (
    !isShoppingListAccessible(list, membership.householdId, session.user.id)
  ) {
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
  const { session, membership } = await requireHousehold()

  const list = await db.shoppingList.findUnique({ where: { id: listId } })
  if (!list) {
    throw new Error("List not found")
  }
  if (
    !isShoppingListAccessible(list, membership.householdId, session.user.id)
  ) {
    throw new Error("List not found")
  }

  await db.shoppingList.delete({ where: { id: listId } })

  revalidatePath("/lists")
  revalidatePath("/")
}

export async function setShoppingListPrivacy(
  listId: string,
  isPrivate: boolean
) {
  const { session, membership } = await requireHousehold()

  const list = await db.shoppingList.findUnique({ where: { id: listId } })
  if (!list || list.householdId !== membership.householdId) {
    throw new Error("List not found")
  }
  if (!canManageShoppingListPrivacy(list, session.user.id)) {
    throw new Error("You do not have access to change privacy for this list")
  }

  await db.$transaction([
    db.shoppingList.update({
      where: { id: listId },
      data: {
        isPrivate,
        createdById: list.createdById ?? session.user.id,
      },
    }),
    ...(isPrivate
      ? [
          db.shareLink.updateMany({
            where: { listId, isActive: true },
            data: { isActive: false },
          }),
        ]
      : []),
  ])

  revalidatePath(`/lists/${listId}`)
  revalidatePath("/lists")
  revalidatePath("/")
}
