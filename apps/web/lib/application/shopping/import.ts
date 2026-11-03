import { db, Phase, Priority, type Prisma } from "@workspace/db"

import { getVisibleShoppingListsWhere } from "../../shopping-list-access"
import type { ApplicationContext } from "../context"
import {
  assertBatchSize,
  lenientUrl,
  notFound,
  validationError,
} from "../mutations"
import {
  assertCategoriesInHousehold,
  insertShoppingItems,
  type NewShoppingItem,
} from "./write"

/**
 * The LLM import flows on the list page. They take pasted model output, so
 * they are deliberately lenient where the single-item services are strict: an
 * unknown priority falls back to MEDIUM, an unknown phase or unusable URL is
 * dropped. That is the behaviour the import screen was built around, kept here
 * on purpose. What is not lenient is the boundary: every list, item and
 * category id is checked against the caller's visible list and household.
 */

const PRIORITY_VALUES = new Set<string>(Object.values(Priority))
const PHASE_VALUES = new Set<string>(Object.values(Phase))

const IMPORT_TRANSACTION_OPTIONS = { timeout: 30_000, maxWait: 5_000 }

export type ImportAlternativeInput = {
  name: string
  price?: number
  url?: string
  imageUrl?: string
  storeName?: string
  notes?: string
}

export type ImportItemInput = {
  name: string
  description?: string
  categoryName?: string
  priority?: Priority
  phase?: Phase
  estimatedPrice?: number
  url?: string
  imageUrl?: string
  storeName?: string
  alternatives?: ImportAlternativeInput[]
}

export type ImportItemsInput = {
  items: ImportItemInput[]
  listId: string
  /** categoryName -> categoryId, as offered to the browser by the page. */
  categoryMap: Record<string, string>
}

export type ImportItemFieldUpdate = {
  id: string
  fields: {
    description?: string
    categoryId?: string | null
    priority?: Priority
    phase?: Phase | null
    estimatedPrice?: number
    url?: string
    imageUrl?: string
    storeName?: string
  }
}

export type ImportItemsWithDuplicatesInput = {
  newItems: ImportItemInput[]
  updates: ImportItemFieldUpdate[]
  listId: string
  categoryMap: Record<string, string>
}

export type ExistingShoppingItem = {
  id: string
  name: string
  description: string | null
  categoryId: string | null
  priority: string
  phase: string | null
  estimatedPrice: number | null
  url: string | null
  imageUrl: string | null
  storeName: string | null
  alternativeCount: number
}

type Tx = Prisma.TransactionClient

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function visibleListWhere(context: ApplicationContext, listId: string) {
  // A malformed id can never match; Prisma would reject it as a crash.
  if (!UUID_PATTERN.test(listId)) throw notFound("handleliste")
  return {
    ...getVisibleShoppingListsWhere(context.householdId, context.userId),
    id: listId,
  }
}

async function assertListVisible(
  tx: Tx,
  context: ApplicationContext,
  listId: string
) {
  const list = await tx.shoppingList.findFirst({
    where: visibleListWhere(context, listId),
    select: { id: true },
  })
  if (!list) throw notFound("handleliste")
}

/**
 * The category map comes back from the browser, so it is untrusted: every id
 * in it must be one of the household's categories.
 */
export async function assertCategoryMapInHousehold(
  tx: Tx,
  context: ApplicationContext,
  categoryMap: Record<string, string>
) {
  await assertCategoriesInHousehold(tx, context, Object.values(categoryMap))
}

function lenientPriority(value: string | undefined): Priority {
  return value && PRIORITY_VALUES.has(value) ? (value as Priority) : "MEDIUM"
}

function lenientPhase(value: string | null | undefined): Phase | undefined {
  return value && PHASE_VALUES.has(value) ? (value as Phase) : undefined
}

function blankToUndefined(value: string | undefined) {
  return value?.trim() ? value : undefined
}

/** Maps one pasted item onto the strict service input. */
export function toNewShoppingItem(
  item: ImportItemInput,
  categoryMap: Record<string, string>
): NewShoppingItem {
  return {
    name: item.name,
    description: blankToUndefined(item.description),
    categoryId: item.categoryName
      ? (categoryMap[item.categoryName] ?? undefined)
      : undefined,
    priority: lenientPriority(item.priority),
    phase: lenientPhase(item.phase),
    estimatedPrice: item.estimatedPrice ?? undefined,
    url: lenientUrl(item.url),
    imageUrl: lenientUrl(item.imageUrl),
    storeName: blankToUndefined(item.storeName),
    alternatives: (item.alternatives ?? []).map((alternative) => ({
      name: alternative.name,
      price: alternative.price ?? undefined,
      url: lenientUrl(alternative.url),
      imageUrl: lenientUrl(alternative.imageUrl),
      storeName: blankToUndefined(alternative.storeName),
      notes: blankToUndefined(alternative.notes),
    })),
  }
}

export async function bulkCreateShoppingItems(
  context: ApplicationContext,
  input: ImportItemsInput
) {
  assertBatchSize(input.items.length, "Varer")

  return db.$transaction(async (tx) => {
    await assertListVisible(tx, context, input.listId)
    await assertCategoryMapInHousehold(tx, context, input.categoryMap)

    const { created } = await insertShoppingItems(
      tx,
      context,
      input.listId,
      input.items.map((item) => toNewShoppingItem(item, input.categoryMap)),
      { onDuplicate: "create" }
    )
    return { count: created.length }
  }, IMPORT_TRANSACTION_OPTIONS)
}

export async function findExistingShoppingItems(
  context: ApplicationContext,
  listId: string,
  names: string[]
): Promise<ExistingShoppingItem[]> {
  assertBatchSize(names.length, "Navn", { allowEmpty: true })

  const list = await db.shoppingList.findFirst({
    where: visibleListWhere(context, listId),
    select: { id: true },
  })
  if (!list) throw notFound("handleliste")

  const lowerNames = new Set(names.map((name) => name.toLowerCase()))
  const existing = await db.shoppingItem.findMany({
    where: { listId },
    select: {
      id: true,
      name: true,
      description: true,
      categoryId: true,
      priority: true,
      phase: true,
      estimatedPrice: true,
      url: true,
      imageUrl: true,
      storeName: true,
      _count: { select: { alternatives: true } },
    },
  })

  return existing
    .filter((item) => lowerNames.has(item.name.toLowerCase()))
    .map(({ _count, estimatedPrice, ...item }) => ({
      ...item,
      estimatedPrice: estimatedPrice ? Number(estimatedPrice) : null,
      alternativeCount: _count.alternatives,
    }))
}

function updateData(update: ImportItemFieldUpdate) {
  const { fields } = update
  const data: Prisma.ShoppingItemUpdateManyMutationInput & {
    categoryId?: string | null
  } = {}

  if (fields.description !== undefined)
    data.description = fields.description ?? undefined
  if (fields.categoryId !== undefined) data.categoryId = fields.categoryId
  if (fields.priority !== undefined && PRIORITY_VALUES.has(fields.priority))
    data.priority = fields.priority
  if (
    fields.phase !== undefined &&
    (fields.phase === null || PHASE_VALUES.has(fields.phase))
  )
    data.phase = fields.phase
  if (fields.estimatedPrice !== undefined) {
    if (!Number.isFinite(fields.estimatedPrice) || fields.estimatedPrice < 0) {
      throw validationError("Estimert pris må være et positivt tall.")
    }
    data.estimatedPrice = fields.estimatedPrice
  }
  if (fields.url !== undefined) data.url = lenientUrl(fields.url)
  if (fields.imageUrl !== undefined) data.imageUrl = lenientUrl(fields.imageUrl)
  if (fields.storeName !== undefined)
    data.storeName = fields.storeName || undefined

  return data
}

/**
 * Creates the new items and applies the selected field updates to existing
 * ones, all in one transaction. Every update id must be an item on this same
 * visible list; one id outside it fails the whole import and nothing changes.
 */
export async function bulkImportShoppingItemsWithDuplicates(
  context: ApplicationContext,
  input: ImportItemsWithDuplicatesInput
) {
  assertBatchSize(input.newItems.length + input.updates.length, "Varer", {
    allowEmpty: true,
  })

  return db.$transaction(async (tx) => {
    await assertListVisible(tx, context, input.listId)
    await assertCategoryMapInHousehold(tx, context, input.categoryMap)
    await assertCategoriesInHousehold(
      tx,
      context,
      input.updates.map((update) => update.fields.categoryId)
    )

    let count = 0

    if (input.newItems.length > 0) {
      const { created } = await insertShoppingItems(
        tx,
        context,
        input.listId,
        input.newItems.map((item) =>
          toNewShoppingItem(item, input.categoryMap)
        ),
        { onDuplicate: "create" }
      )
      count += created.length
    }

    for (const update of input.updates) {
      if (!UUID_PATTERN.test(update.id)) throw notFound("vare")
      const changed = await tx.shoppingItem.updateMany({
        where: {
          id: update.id,
          listId: input.listId,
          list: getVisibleShoppingListsWhere(
            context.householdId,
            context.userId
          ),
        },
        data: updateData(update),
      })
      if (changed.count !== 1) throw notFound("vare")
      count += 1
    }

    return { count }
  }, IMPORT_TRANSACTION_OPTIONS)
}
