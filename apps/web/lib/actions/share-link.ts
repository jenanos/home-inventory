"use server"

import { randomBytes } from "crypto"
import { db } from "@workspace/db"
import { requireHousehold } from "@/lib/session"
import { isShoppingListAccessible } from "@/lib/shopping-list-access"
import { revalidatePath } from "next/cache"

export async function createShareLink(listId: string, expiresInDays?: number) {
  const { session, membership } = await requireHousehold()

  const list = await db.shoppingList.findUnique({ where: { id: listId } })
  if (
    !isShoppingListAccessible(list, membership.householdId, session.user.id)
  ) {
    throw new Error("List not found")
  }
  if (list.isPrivate) {
    throw new Error("Private lists cannot be shared")
  }

  const token = randomBytes(32).toString("hex")
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : undefined

  const shareLink = await db.shareLink.create({
    data: {
      token,
      listId,
      createdBy: session.user.id,
      expiresAt,
    },
  })

  revalidatePath(`/lists/${listId}`)
  return shareLink
}

export async function deactivateShareLink(shareLinkId: string) {
  const { session, membership } = await requireHousehold()

  const link = await db.shareLink.findUnique({
    where: { id: shareLinkId },
    include: { list: true },
  })
  if (
    !link ||
    !isShoppingListAccessible(
      link.list,
      membership.householdId,
      session.user.id
    )
  ) {
    throw new Error("Share link not found")
  }

  await db.shareLink.update({
    where: { id: shareLinkId },
    data: { isActive: false },
  })

  revalidatePath(`/lists/${link.listId}`)
}
