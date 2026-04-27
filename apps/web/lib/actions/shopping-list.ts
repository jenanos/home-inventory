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
  if (!list) {
    throw new Error("List not found")
  }
  if (
    !isShoppingListAccessible(list, membership.householdId, session.user.id)
  ) {
    throw new Error("List not found")
  }
  if (!canManageShoppingListPrivacy(list, session.user.id)) {
    throw new Error("You do not have access to change privacy for this list")
  }

  await db.$transaction(async (tx) => {
    if (list.createdById === null && !list.isPrivate && isPrivate) {
      const claimed = await tx.shoppingList.updateMany({
        where: {
          id: listId,
          householdId: membership.householdId,
          isPrivate: false,
          createdById: null,
        },
        data: {
          isPrivate: true,
          createdById: session.user.id,
        },
      })

      if (claimed.count !== 1) {
        throw new Error("Could not claim this list for private use")
      }
    } else {
      await tx.shoppingList.update({
        where: { id: listId },
        data: { isPrivate },
      })
    }

    if (isPrivate) {
      await tx.shareLink.updateMany({
        where: { listId, isActive: true },
        data: { isActive: false },
      })
    }
  })

  revalidatePath(`/lists/${listId}`)
  revalidatePath("/lists")
  revalidatePath("/")
}
