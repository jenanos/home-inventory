"use server"

import { randomBytes } from "crypto"
import { db } from "@workspace/db"
import { ApplicationError } from "@/lib/application/errors"
import { notFound, numberInRange } from "@/lib/application/mutations"
import { requireHousehold } from "@/lib/session"
import { getVisibleShoppingListsWhere } from "@/lib/shopping-list-access"
import { revalidatePath } from "next/cache"

// Public share links are web-only and deliberately never exposed to MCP.

export async function createShareLink(listId: string, expiresInDays?: number) {
  const { context } = await requireHousehold()

  const expiresAt =
    expiresInDays === undefined
      ? undefined
      : new Date(
          Date.now() +
            numberInRange(expiresInDays, "Gyldighet", { min: 1, max: 365 }) *
              24 *
              60 *
              60 *
              1000
        )

  const shareLink = await db.$transaction(async (tx) => {
    // Visibility and the no-sharing-of-private-lists rule are read in the same
    // transaction as the insert.
    const list = await tx.shoppingList.findFirst({
      where: {
        ...getVisibleShoppingListsWhere(context.householdId, context.userId),
        id: listId,
      },
      select: { id: true, isPrivate: true },
    })
    if (!list) throw notFound("handleliste")
    if (list.isPrivate) {
      throw new ApplicationError("FORBIDDEN", "Private lister kan ikke deles.")
    }

    return tx.shareLink.create({
      data: {
        token: randomBytes(32).toString("hex"),
        listId,
        createdBy: context.userId,
        expiresAt,
      },
    })
  })

  revalidatePath(`/lists/${listId}`)
  return shareLink
}

export async function deactivateShareLink(shareLinkId: string) {
  const { context } = await requireHousehold()

  const link = await db.shareLink.findFirst({
    where: {
      id: shareLinkId,
      list: getVisibleShoppingListsWhere(context.householdId, context.userId),
    },
    select: { listId: true },
  })

  const updated = await db.shareLink.updateMany({
    where: {
      id: shareLinkId,
      list: getVisibleShoppingListsWhere(context.householdId, context.userId),
    },
    data: { isActive: false },
  })
  if (!link || updated.count !== 1) throw notFound("delingslenke")

  revalidatePath(`/lists/${link.listId}`)
}
