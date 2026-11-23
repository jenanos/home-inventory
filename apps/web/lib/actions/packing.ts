"use server"

import { revalidatePath } from "next/cache"

import { toActionResult, type ActionResult } from "@/lib/action-result"
import {
  addBundlesToList as addBundlesToListService,
  addPackingItems as addPackingItemsService,
  createPackingBundle as createPackingBundleService,
  createPackingList as createPackingListService,
  deletePackingBundle as deletePackingBundleService,
  deletePackingItems as deletePackingItemsService,
  deletePackingList as deletePackingListService,
  duplicatePackingList as duplicatePackingListService,
  removeBundleFromList as removeBundleFromListService,
  setPackingItemsPacked as setPackingItemsPackedService,
  updatePackingBundle as updatePackingBundleService,
  updatePackingItem as updatePackingItemService,
  updatePackingList as updatePackingListService,
  type CreatePackingBundleInput,
  type CreatePackingListInput,
  type PackingChangeResult,
  type PackingItemFields,
  type PackingListFields,
  type UpdatePackingBundleInput,
} from "@/lib/application/packing/write"
import { requireHousehold } from "@/lib/session"

// --- Packing list and bundle actions ---
//
// Thin adapters: the browser context comes from the session, the rules and the
// ownership boundary live in the packing services shared with MCP. Expected
// failures come back as `{ ok: false, error }` so the page can show the
// service's message.

function revalidatePacking() {
  revalidatePath("/pakkelister", "layout")
}

/** What the page needs after items were added: how many, and what was skipped. */
type ItemsAdded = {
  listId: string
  createdCount: number
  skippedNames: string[]
}

function itemsAdded(result: PackingChangeResult): ItemsAdded {
  return {
    listId: result.list.id,
    createdCount: result.createdItemIds.length,
    skippedNames: result.skipped.map((item) => item.name),
  }
}

// ─── Lists ──────────────────────────────────────────────────────

export async function createPackingList(
  input: CreatePackingListInput
): Promise<ActionResult<ItemsAdded>> {
  const { context } = await requireHousehold()
  const result = await toActionResult(async () =>
    itemsAdded(await createPackingListService(context, input))
  )
  revalidatePacking()
  return result
}

export async function updatePackingList(
  input: { id: string } & Partial<PackingListFields>
): Promise<ActionResult<{ id: string }>> {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const result = await toActionResult(async () => {
    const list = await updatePackingListService(context, id, fields)
    return { id: list.id }
  })
  revalidatePacking()
  return result
}

export async function deletePackingList(
  listId: string
): Promise<ActionResult<null>> {
  const { context } = await requireHousehold()
  const result = await toActionResult(async () => {
    await deletePackingListService(context, listId)
    return null
  })
  revalidatePacking()
  return result
}

export async function duplicatePackingList(input: {
  listId: string
  name?: string
}): Promise<ActionResult<{ id: string }>> {
  const { context } = await requireHousehold()
  const result = await toActionResult(async () => {
    const copy = await duplicatePackingListService(context, input.listId, {
      name: input.name,
    })
    return { id: copy.id }
  })
  revalidatePacking()
  return result
}

// ─── Items ──────────────────────────────────────────────────────

export async function addPackingItems(input: {
  listId: string
  items: PackingItemFields[]
}): Promise<ActionResult<ItemsAdded>> {
  const { context } = await requireHousehold()
  const result = await toActionResult(async () =>
    itemsAdded(await addPackingItemsService(context, input.listId, input.items))
  )
  revalidatePacking()
  return result
}

export async function updatePackingItem(
  input: { id: string; packed?: boolean } & Partial<PackingItemFields>
): Promise<ActionResult<null>> {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const result = await toActionResult(async () => {
    await updatePackingItemService(context, id, fields)
    return null
  })
  revalidatePacking()
  return result
}

export async function togglePackingItem(input: {
  id: string
  packed: boolean
}): Promise<ActionResult<null>> {
  return updatePackingItem({ id: input.id, packed: input.packed })
}

/** Ticks off or clears every item on the list ("Nullstill avkrysning"). */
export async function setAllPackingItemsPacked(input: {
  listId: string
  packed: boolean
}): Promise<ActionResult<{ changedCount: number }>> {
  const { context } = await requireHousehold()
  const result = await toActionResult(async () => {
    const { changedCount } = await setPackingItemsPackedService(
      context,
      input.listId,
      { packed: input.packed }
    )
    return { changedCount }
  })
  revalidatePacking()
  return result
}

export async function deletePackingItems(
  itemIds: string[]
): Promise<ActionResult<{ deletedCount: number }>> {
  const { context } = await requireHousehold()
  const result = await toActionResult(() =>
    deletePackingItemsService(context, itemIds)
  )
  revalidatePacking()
  return result
}

// ─── Bundles on a list ──────────────────────────────────────────

export async function addBundlesToList(input: {
  listId: string
  bundleIds: string[]
}): Promise<ActionResult<ItemsAdded>> {
  const { context } = await requireHousehold()
  const result = await toActionResult(async () =>
    itemsAdded(
      await addBundlesToListService(context, input.listId, input.bundleIds)
    )
  )
  revalidatePacking()
  return result
}

export async function removeBundleFromList(input: {
  listId: string
  bundleId: string
  keepPacked?: boolean
}): Promise<ActionResult<{ deletedCount: number }>> {
  const { context } = await requireHousehold()
  const result = await toActionResult(async () => {
    const { deletedCount } = await removeBundleFromListService(
      context,
      input.listId,
      input.bundleId,
      { keepPacked: input.keepPacked }
    )
    return { deletedCount }
  })
  revalidatePacking()
  return result
}

// ─── Bundles ────────────────────────────────────────────────────

export async function createPackingBundle(
  input: CreatePackingBundleInput
): Promise<ActionResult<{ id: string }>> {
  const { context } = await requireHousehold()
  const result = await toActionResult(async () => {
    const bundle = await createPackingBundleService(context, input)
    return { id: bundle.id }
  })
  revalidatePacking()
  return result
}

export async function updatePackingBundle(
  input: { id: string } & UpdatePackingBundleInput
): Promise<ActionResult<{ id: string }>> {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const result = await toActionResult(async () => {
    const bundle = await updatePackingBundleService(context, id, fields)
    return { id: bundle.id }
  })
  revalidatePacking()
  return result
}

export async function deletePackingBundle(
  bundleId: string
): Promise<ActionResult<null>> {
  const { context } = await requireHousehold()
  const result = await toActionResult(async () => {
    await deletePackingBundleService(context, bundleId)
    return null
  })
  revalidatePacking()
  return result
}
