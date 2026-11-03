"use server"

import {
  createShoppingList as createShoppingListService,
  deleteShoppingList as deleteShoppingListService,
  setShoppingListPrivacy as setShoppingListPrivacyService,
  updateShoppingList as updateShoppingListService,
} from "@/lib/application/shopping/write"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

// Thin adapters: the browser context comes from the session; the rules and the
// private-list boundary live in the shopping write service shared with MCP.

interface CreateShoppingListInput {
  name: string
  isPrivate?: boolean
}

export async function createShoppingList(input: CreateShoppingListInput) {
  const { context } = await requireHousehold()
  const list = await createShoppingListService(context, input)

  revalidatePath("/")
  revalidatePath("/lists")
  return list
}

interface UpdateShoppingListInput {
  name?: string
  /** Color preset id, or null to clear back to default. */
  color?: string | null
}

export async function updateShoppingList(
  listId: string,
  input: UpdateShoppingListInput
) {
  const { context } = await requireHousehold()
  await updateShoppingListService(context, listId, {
    name: input.name,
    color: input.color,
  })

  revalidatePath(`/lists/${listId}`)
  revalidatePath("/lists")
  revalidatePath("/")
}

export async function deleteShoppingList(listId: string) {
  const { context } = await requireHousehold()
  await deleteShoppingListService(context, listId)

  revalidatePath("/lists")
  revalidatePath("/")
}

export async function setShoppingListPrivacy(
  listId: string,
  isPrivate: boolean
) {
  const { context } = await requireHousehold()
  await setShoppingListPrivacyService(context, listId, isPrivate)

  revalidatePath(`/lists/${listId}`)
  revalidatePath("/lists")
  revalidatePath("/")
}
