"use server"

import {
  addProductAlternative,
  deleteProductAlternative,
  reorderAlternatives as reorderAlternativesService,
  setPreferredAlternative as setPreferredAlternativeService,
  updateProductAlternative,
  type ProductAlternativeFields,
} from "@/lib/application/shopping/write"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

// Every alternative is reached through its item's visible list, so a household
// member cannot touch alternatives on another member's private list.

interface CreateAlternativeInput extends ProductAlternativeFields {
  itemId: string
}

function plainPrice<T extends { price: { toNumber(): number } | null }>(
  alternative: T
) {
  return {
    ...alternative,
    price: alternative.price ? alternative.price.toNumber() : null,
  }
}

export async function createAlternative(input: CreateAlternativeInput) {
  const { context } = await requireHousehold()
  const { itemId, ...fields } = input
  const { alternative, listId } = await addProductAlternative(
    context,
    itemId,
    fields
  )

  revalidatePath(`/lists/${listId}`)
  return plainPrice(alternative)
}

interface UpdateAlternativeInput extends Partial<ProductAlternativeFields> {
  id: string
}

export async function updateAlternative(input: UpdateAlternativeInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const { alternative, listId } = await updateProductAlternative(
    context,
    id,
    fields
  )

  revalidatePath(`/lists/${listId}`)
  return plainPrice(alternative)
}

export async function deleteAlternative(alternativeId: string) {
  const { context } = await requireHousehold()
  const { listId } = await deleteProductAlternative(context, alternativeId)

  revalidatePath(`/lists/${listId}`)
}

export async function reorderAlternatives(
  itemId: string,
  orderedIds: string[]
) {
  const { context } = await requireHousehold()
  const { listId } = await reorderAlternativesService(
    context,
    itemId,
    orderedIds
  )

  revalidatePath(`/lists/${listId}`)
}

export async function setPreferredAlternative(
  itemId: string,
  alternativeId: string
) {
  const { context } = await requireHousehold()
  const { listId } = await setPreferredAlternativeService(
    context,
    itemId,
    alternativeId
  )

  revalidatePath(`/lists/${listId}`)
}
