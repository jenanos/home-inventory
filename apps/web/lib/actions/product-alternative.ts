"use server"

import { db } from "@workspace/db"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

interface CreateAlternativeInput {
  itemId: string
  name: string
  price?: number
  url?: string
  storeName?: string
  notes?: string
}

async function verifyItemOwnership(itemId: string, householdId: string) {
  const item = await db.shoppingItem.findUnique({
    where: { id: itemId },
    include: { list: true },
  })
  if (!item || item.list.householdId !== householdId) {
    throw new Error("Item not found")
  }
  return item
}

export async function createAlternative(input: CreateAlternativeInput) {
  const { membership } = await requireHousehold()
  const item = await verifyItemOwnership(input.itemId, membership.householdId)

  // Set rank to be after the last existing alternative
  const lastAlt = await db.productAlternative.findFirst({
    where: { itemId: input.itemId },
    orderBy: { rank: "desc" },
  })
  const nextRank = (lastAlt?.rank ?? -1) + 1

  const alt = await db.productAlternative.create({
    data: {
      name: input.name,
      price: input.price,
      url: input.url,
      storeName: input.storeName,
      notes: input.notes,
      rank: nextRank,
      itemId: input.itemId,
    },
  })

  revalidatePath(`/lists/${item.listId}`)
  return { ...alt, price: alt.price ? Number(alt.price) : null }
}

interface UpdateAlternativeInput {
  id: string
  name?: string
  price?: number | null
  url?: string | null
  storeName?: string | null
  notes?: string | null
}

export async function updateAlternative(input: UpdateAlternativeInput) {
  const { membership } = await requireHousehold()

  const alt = await db.productAlternative.findUnique({
    where: { id: input.id },
    include: { item: { include: { list: true } } },
  })
  if (!alt || alt.item.list.householdId !== membership.householdId) {
    throw new Error("Alternative not found")
  }

  const { id, ...data } = input
  const updated = await db.productAlternative.update({
    where: { id },
    data,
  })

  revalidatePath(`/lists/${alt.item.listId}`)
  return { ...updated, price: updated.price ? Number(updated.price) : null }
}

export async function deleteAlternative(alternativeId: string) {
  const { membership } = await requireHousehold()

  const alt = await db.productAlternative.findUnique({
    where: { id: alternativeId },
    include: { item: { include: { list: true } } },
  })
  if (!alt || alt.item.list.householdId !== membership.householdId) {
    throw new Error("Alternative not found")
  }

  await db.productAlternative.delete({ where: { id: alternativeId } })

  revalidatePath(`/lists/${alt.item.listId}`)
}

export async function reorderAlternatives(
  itemId: string,
  orderedIds: string[]
) {
  const { membership } = await requireHousehold()
  const item = await verifyItemOwnership(itemId, membership.householdId)

  await db.$transaction(
    orderedIds.map((id, index) =>
      db.productAlternative.update({
        where: { id },
        data: { rank: index },
      })
    )
  )

  revalidatePath(`/lists/${item.listId}`)
}

export async function setPreferredAlternative(
  itemId: string,
  alternativeId: string
) {
  const { membership } = await requireHousehold()
  const item = await verifyItemOwnership(itemId, membership.householdId)

  // Get all alternatives ordered by rank
  const alternatives = await db.productAlternative.findMany({
    where: { itemId },
    orderBy: { rank: "asc" },
  })

  // Build new order: the chosen alternative first, then the rest in their current order
  const orderedIds = [
    alternativeId,
    ...alternatives.filter((a) => a.id !== alternativeId).map((a) => a.id),
  ]

  await db.$transaction(
    orderedIds.map((id, index) =>
      db.productAlternative.update({
        where: { id },
        data: { rank: index },
      })
    )
  )

  revalidatePath(`/lists/${item.listId}`)
}
