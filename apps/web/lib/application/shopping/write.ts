import { db, ItemStatus, Priority, Timeframe, type Prisma } from "@workspace/db"

import { isListColorId } from "../../list-colors"
import {
  canManageShoppingListPrivacy,
  getVisibleShoppingListsWhere,
} from "../../shopping-list-access"
import type { ApplicationContext } from "../context"
import { ApplicationError } from "../errors"
import {
  MAX_LONG_TEXT_LENGTH,
  assertBatchSize,
  definedFields,
  enumValue,
  freshness,
  isUniqueConstraintError,
  notFound,
  optionalCalendarDate,
  optionalMoneyAmount,
  optionalText,
  optionalUrl,
  requiredText,
  scopedWrite,
  validationError,
} from "../mutations"

/**
 * Shopping write services, shared by the web actions and the MCP tools.
 *
 * Every item and alternative is reached through its parent list's visibility
 * rule, so the private-list boundary applies to a child id exactly as it does
 * to the list itself. Authorization is part of each write's `where`; a miss is
 * NOT_FOUND whether the id is unknown or belongs to someone else.
 */

const LIST = "handleliste"
const ITEM = "vare"
const ALTERNATIVE = "produktalternativ"
const CATEGORY = "kategori"

const PRIORITY_VALUES = Object.values(Priority)
const TIMEFRAME_VALUES = Object.values(Timeframe)
const ITEM_STATUS_VALUES = Object.values(ItemStatus)

/** Alternatives are a short list per item, not a catalogue. */
export const MAX_ALTERNATIVES_PER_ITEM = 25

/** Batched creates run one statement per row; allow for that. */
const BATCH_TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 }

type Tx = Prisma.TransactionClient

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A malformed id can never match, so it is NOT_FOUND rather than a crash. */
function assertResourceId(value: string, resource: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw notFound(resource)
  }
  return value
}

function visibleLists(context: ApplicationContext) {
  return getVisibleShoppingListsWhere(context.householdId, context.userId)
}

function visibleItemWhere(context: ApplicationContext, itemId: string) {
  return { id: itemId, list: visibleLists(context) }
}

function visibleAlternativeWhere(
  context: ApplicationContext,
  alternativeId: string
) {
  return { id: alternativeId, item: { list: visibleLists(context) } }
}

// ─── Result shapes ──────────────────────────────────────────────

export const SHOPPING_LIST_RESULT_SELECT = {
  id: true,
  name: true,
  color: true,
  isPrivate: true,
  createdById: true,
  householdId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ShoppingListSelect

export const PRODUCT_ALTERNATIVE_RESULT_SELECT = {
  id: true,
  name: true,
  price: true,
  url: true,
  imageUrl: true,
  storeName: true,
  notes: true,
  rank: true,
  itemId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductAlternativeSelect

/** Everything a caller may see of an item. No `assignedTo` user record. */
export const SHOPPING_ITEM_RESULT_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  priority: true,
  timeframe: true,
  dueDate: true,
  estimatedPrice: true,
  url: true,
  imageUrl: true,
  storeName: true,
  assignedToId: true,
  purchasedAt: true,
  listId: true,
  categoryId: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  alternatives: {
    select: PRODUCT_ALTERNATIVE_RESULT_SELECT,
    orderBy: [{ rank: "asc" }, { id: "asc" }],
  },
  _count: { select: { alternatives: true } },
} satisfies Prisma.ShoppingItemSelect

export type ShoppingItemResult = Prisma.ShoppingItemGetPayload<{
  select: typeof SHOPPING_ITEM_RESULT_SELECT
}>

// ─── Field normalization ────────────────────────────────────────

/**
 * Item fields a caller may set. `undefined` leaves a column alone on update;
 * `null` clears it. `dueDate` accepts a `Date` from the web flow or
 * `YYYY-MM-DD` from MCP.
 */
export type ShoppingItemFields = {
  name: string
  description?: string | null
  categoryId?: string | null
  priority?: Priority
  timeframe?: Timeframe | null
  dueDate?: Date | string | null
  estimatedPrice?: number | null
  url?: string | null
  imageUrl?: string | null
  storeName?: string | null
  /** Web only. Must be a member of the caller's household. */
  assignedToId?: string | null
}

export type ProductAlternativeFields = {
  name: string
  price?: number | null
  url?: string | null
  imageUrl?: string | null
  storeName?: string | null
  notes?: string | null
}

export type NewShoppingItem = ShoppingItemFields & {
  alternatives?: ProductAlternativeFields[]
}

function normalizeItemFields(input: Partial<ShoppingItemFields>) {
  return definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    description: optionalText(
      input.description,
      "Beskrivelse",
      MAX_LONG_TEXT_LENGTH
    ),
    categoryId: input.categoryId,
    priority:
      input.priority === undefined
        ? undefined
        : enumValue(input.priority, PRIORITY_VALUES, "Prioritet"),
    timeframe:
      input.timeframe == null
        ? input.timeframe
        : enumValue(input.timeframe, TIMEFRAME_VALUES, "Når"),
    dueDate: optionalCalendarDate(input.dueDate, "Frist"),
    estimatedPrice: optionalMoneyAmount(input.estimatedPrice, "Estimert pris"),
    url: optionalUrl(input.url, "URL"),
    imageUrl: optionalUrl(input.imageUrl, "Bilde-URL"),
    storeName: optionalText(input.storeName, "Butikk"),
    assignedToId: input.assignedToId,
  })
}

function normalizeAlternativeFields(input: Partial<ProductAlternativeFields>) {
  return definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    price: optionalMoneyAmount(input.price, "Pris"),
    url: optionalUrl(input.url, "URL"),
    imageUrl: optionalUrl(input.imageUrl, "Bilde-URL"),
    storeName: optionalText(input.storeName, "Butikk"),
    notes: optionalText(input.notes, "Notater", MAX_LONG_TEXT_LENGTH),
  })
}

/** Rejects a category id that is not one of the household's categories. */
export async function assertCategoriesInHousehold(
  tx: Tx,
  context: ApplicationContext,
  categoryIds: Iterable<string | null | undefined>
) {
  const ids = [...new Set([...categoryIds].filter((id): id is string => !!id))]
  if (ids.length === 0) return

  if (ids.some((id) => !UUID_PATTERN.test(id))) {
    throw validationError("Kategorien finnes ikke i husstanden.")
  }

  const found = await tx.category.count({
    where: { id: { in: ids }, householdId: context.householdId },
  })
  if (found !== ids.length) {
    throw validationError("Kategorien finnes ikke i husstanden.")
  }
}

async function assertAssigneeInHousehold(
  tx: Tx,
  context: ApplicationContext,
  assignedToId: string | null | undefined
) {
  if (!assignedToId) return

  const member =
    UUID_PATTERN.test(assignedToId) &&
    (await tx.householdMember.count({
      where: { userId: assignedToId, householdId: context.householdId },
    })) === 1

  if (!member) {
    throw validationError("Personen er ikke medlem av husstanden.")
  }
}

function duplicateKey(name: string) {
  return name.trim().toLocaleLowerCase("nb-NO")
}

// ─── Lists ──────────────────────────────────────────────────────

function normalizeColor(color: string | null | undefined) {
  if (color === undefined) return undefined
  if (color === null || color === "default") return null
  if (isListColorId(color)) return color
  throw validationError("Ukjent farge.")
}

export async function createShoppingList(
  context: ApplicationContext,
  input: { name: string; isPrivate?: boolean; color?: string | null }
) {
  if (input.isPrivate !== undefined && typeof input.isPrivate !== "boolean") {
    throw validationError("Privat må være sann eller usann.")
  }

  return db.shoppingList.create({
    data: {
      name: requiredText(input.name, "Navn"),
      color: normalizeColor(input.color) ?? null,
      isPrivate: input.isPrivate ?? false,
      householdId: context.householdId,
      createdById: context.userId,
    },
    select: SHOPPING_LIST_RESULT_SELECT,
  })
}

export async function updateShoppingList(
  context: ApplicationContext,
  listId: string,
  input: { name?: string; color?: string | null; expectedUpdatedAt?: Date }
) {
  assertResourceId(listId, LIST)
  const data = definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    color: normalizeColor(input.color),
  })
  const scope = { ...visibleLists(context), id: listId }

  if (Object.keys(data).length === 0) {
    const list = await db.shoppingList.findFirst({
      where: scope,
      select: SHOPPING_LIST_RESULT_SELECT,
    })
    if (!list) throw notFound(LIST)
    return list
  }

  return scopedWrite({
    resource: LIST,
    expectedUpdatedAt: input.expectedUpdatedAt,
    write: () =>
      db.shoppingList.update({
        where: { ...scope, ...freshness(input.expectedUpdatedAt) },
        data,
        select: SHOPPING_LIST_RESULT_SELECT,
      }),
    existsInScope: async () =>
      (await db.shoppingList.count({ where: scope })) > 0,
  })
}

export async function deleteShoppingList(
  context: ApplicationContext,
  listId: string
) {
  assertResourceId(listId, LIST)
  return scopedWrite({
    resource: LIST,
    write: () =>
      db.shoppingList.delete({
        where: { ...visibleLists(context), id: listId },
        select: { id: true },
      }),
  })
}

/**
 * Making a list private hides it from the rest of the household and
 * deactivates its share links. A public list without an owner (its creator was
 * deleted) is claimed by whoever makes it private.
 */
export async function setShoppingListPrivacy(
  context: ApplicationContext,
  listId: string,
  isPrivate: boolean
) {
  assertResourceId(listId, LIST)
  if (typeof isPrivate !== "boolean") {
    throw validationError("Privat må være sann eller usann.")
  }

  return db.$transaction(async (tx) => {
    const list = await tx.shoppingList.findFirst({
      where: { ...visibleLists(context), id: listId },
      select: { id: true, isPrivate: true, createdById: true },
    })
    if (!list) throw notFound(LIST)

    if (!canManageShoppingListPrivacy(list, context.userId)) {
      throw new ApplicationError(
        "FORBIDDEN",
        "Bare den som opprettet listen kan endre om den er privat."
      )
    }

    const claimsUnownedList =
      list.createdById === null && !list.isPrivate && isPrivate

    // The manage rule is repeated in the `where`, so the write cannot land if
    // ownership changed after the read above.
    const changed = await tx.shoppingList.updateMany({
      where: claimsUnownedList
        ? {
            id: listId,
            householdId: context.householdId,
            isPrivate: false,
            createdById: null,
          }
        : {
            id: listId,
            householdId: context.householdId,
            OR: [
              { createdById: context.userId },
              { isPrivate: false, createdById: null },
            ],
          },
      data: claimsUnownedList
        ? { isPrivate: true, createdById: context.userId }
        : { isPrivate },
    })

    if (changed.count !== 1) {
      throw new ApplicationError(
        "CONFLICT",
        "Listen ble endret samtidig. Last siden på nytt og prøv igjen."
      )
    }

    if (isPrivate) {
      await tx.shareLink.updateMany({
        where: { listId, isActive: true },
        data: { isActive: false },
      })
    }

    return tx.shoppingList.findFirstOrThrow({
      where: { id: listId },
      select: SHOPPING_LIST_RESULT_SELECT,
    })
  })
}

// ─── Items ──────────────────────────────────────────────────────

export type AddShoppingItemsResult = {
  created: ShoppingItemResult[]
  /** Items not created because the list (or the batch) already had the name. */
  skipped: Array<{ name: string; existingItemId: string }>
}

/**
 * Creates items inside an existing transaction. The list must already have been
 * resolved through the visibility rule by the caller.
 */
export async function insertShoppingItems(
  tx: Tx,
  context: ApplicationContext,
  listId: string,
  items: NewShoppingItem[],
  { onDuplicate }: { onDuplicate: "skip" | "create" }
): Promise<AddShoppingItemsResult> {
  const normalized = items.map((item) => {
    const alternatives = item.alternatives ?? []
    if (alternatives.length > MAX_ALTERNATIVES_PER_ITEM) {
      throw validationError(
        `En vare kan ha maks ${MAX_ALTERNATIVES_PER_ITEM} alternativer.`
      )
    }

    return {
      fields: {
        ...normalizeItemFields(item),
        name: requiredText(item.name, "Navn"),
      },
      alternatives: alternatives.map((alternative) => ({
        ...normalizeAlternativeFields(alternative),
        name: requiredText(alternative.name, "Navn"),
      })),
    }
  })

  await assertCategoriesInHousehold(
    tx,
    context,
    normalized.map((item) => item.fields.categoryId)
  )
  for (const assignee of new Set(
    normalized.map((item) => item.fields.assignedToId)
  )) {
    await assertAssigneeInHousehold(tx, context, assignee)
  }

  const known = new Map<string, string>()
  if (onDuplicate === "skip") {
    const existing = await tx.shoppingItem.findMany({
      where: { listId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    })
    for (const item of existing) {
      const key = duplicateKey(item.name)
      if (!known.has(key)) known.set(key, item.id)
    }
  }

  const result: AddShoppingItemsResult = { created: [], skipped: [] }

  for (const { fields, alternatives } of normalized) {
    const key = duplicateKey(fields.name)
    const existingItemId = known.get(key)

    if (onDuplicate === "skip" && existingItemId) {
      result.skipped.push({ name: fields.name, existingItemId })
      continue
    }

    const created = await tx.shoppingItem.create({
      data: {
        ...fields,
        listId,
        alternatives:
          alternatives.length > 0
            ? {
                create: alternatives.map((alternative, rank) => ({
                  ...alternative,
                  rank,
                })),
              }
            : undefined,
      },
      select: SHOPPING_ITEM_RESULT_SELECT,
    })

    result.created.push(created)
    if (onDuplicate === "skip") known.set(key, created.id)
  }

  return result
}

/**
 * Adds 1..MAX_BATCH_SIZE items to a visible list in one transaction. With
 * `onDuplicate: "skip"` an item whose name (case-insensitive) is already on the
 * list, or earlier in the same batch, is reported instead of created.
 */
export async function addShoppingItems(
  context: ApplicationContext,
  listId: string,
  items: NewShoppingItem[],
  { onDuplicate = "skip" }: { onDuplicate?: "skip" | "create" } = {}
): Promise<AddShoppingItemsResult> {
  assertResourceId(listId, LIST)
  assertBatchSize(items.length, "Varer")

  return db.$transaction(async (tx) => {
    const list = await tx.shoppingList.findFirst({
      where: { ...visibleLists(context), id: listId },
      select: { id: true },
    })
    if (!list) throw notFound(LIST)

    return insertShoppingItems(tx, context, listId, items, { onDuplicate })
  }, BATCH_TRANSACTION_OPTIONS)
}

/** The web's single-item form: always creates, even if the name exists. */
export async function createShoppingItem(
  context: ApplicationContext,
  input: NewShoppingItem & { listId: string }
) {
  const { listId, ...item } = input
  const { created } = await addShoppingItems(context, listId, [item], {
    onDuplicate: "create",
  })
  const [first] = created
  if (!first) throw notFound(LIST)
  return first
}

export type UpdateShoppingItemInput = Partial<ShoppingItemFields> & {
  /** Web only; MCP uses setShoppingItemStatus. */
  status?: ItemStatus
  expectedUpdatedAt?: Date
}

/**
 * Keeps `purchasedAt` consistent with `status`: set on the transition into
 * PURCHASED, kept while it stays PURCHASED, cleared when it leaves. An update
 * that does not mention status leaves both alone.
 */
export async function updateShoppingItem(
  context: ApplicationContext,
  itemId: string,
  input: UpdateShoppingItemInput
): Promise<ShoppingItemResult> {
  assertResourceId(itemId, ITEM)
  const { status, expectedUpdatedAt, ...rest } = input
  const fields = normalizeItemFields(rest)
  const nextStatus =
    status === undefined
      ? undefined
      : enumValue(status, ITEM_STATUS_VALUES, "Status")
  const scope = visibleItemWhere(context, itemId)

  return db.$transaction(async (tx) => {
    await assertCategoriesInHousehold(tx, context, [fields.categoryId])
    await assertAssigneeInHousehold(tx, context, fields.assignedToId)

    const updated = await scopedWrite({
      resource: ITEM,
      expectedUpdatedAt,
      write: () =>
        tx.shoppingItem.update({
          where: { ...scope, ...freshness(expectedUpdatedAt) },
          data: {
            ...fields,
            ...(nextStatus !== undefined && {
              status: nextStatus,
              ...(nextStatus !== "PURCHASED" && { purchasedAt: null }),
            }),
          },
          select: SHOPPING_ITEM_RESULT_SELECT,
        }),
      existsInScope: async () =>
        (await tx.shoppingItem.count({ where: scope })) > 0,
    })

    if (nextStatus === "PURCHASED" && updated.purchasedAt === null) {
      return tx.shoppingItem.update({
        where: { id: itemId },
        data: { purchasedAt: new Date() },
        select: SHOPPING_ITEM_RESULT_SELECT,
      })
    }

    return updated
  })
}

async function applyItemStatus(
  tx: Tx,
  where: Prisma.ShoppingItemWhereInput,
  status: ItemStatus,
  now: Date
) {
  // Rows already in the target state are not touched, so a retry changes
  // nothing — not even `updatedAt` (plan 9.2).
  if (status === "PURCHASED") {
    await tx.shoppingItem.updateMany({
      where: {
        ...where,
        OR: [{ status: { not: "PURCHASED" } }, { purchasedAt: null }],
      },
      data: { status, purchasedAt: now },
    })
  } else {
    await tx.shoppingItem.updateMany({
      where: {
        ...where,
        OR: [{ status: { not: status } }, { purchasedAt: { not: null } }],
      },
      data: { status, purchasedAt: null },
    })
  }
}

/**
 * Sets the status of one or more items. Every id must be a visible item, or
 * nothing changes and the call is NOT_FOUND.
 */
export async function setShoppingItemStatus(
  context: ApplicationContext,
  itemIds: string[],
  status: ItemStatus
): Promise<ShoppingItemResult[]> {
  assertBatchSize(itemIds.length, "Varer")
  const ids = [...new Set(itemIds.map((id) => assertResourceId(id, ITEM)))]
  const target = enumValue(status, ITEM_STATUS_VALUES, "Status")
  const where = { id: { in: ids }, list: visibleLists(context) }

  return db.$transaction(async (tx) => {
    const visible = await tx.shoppingItem.count({ where })
    if (visible !== ids.length) throw notFound(ITEM)

    await applyItemStatus(tx, where, target, new Date())

    return tx.shoppingItem.findMany({
      where,
      select: SHOPPING_ITEM_RESULT_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
  })
}

/** The web checkbox. Not exposed to MCP: a toggle is not idempotent. */
export async function toggleShoppingItemPurchased(
  context: ApplicationContext,
  itemId: string
) {
  assertResourceId(itemId, ITEM)
  const where = visibleItemWhere(context, itemId)

  return db.$transaction(async (tx) => {
    const item = await tx.shoppingItem.findFirst({
      where,
      select: { status: true },
    })
    if (!item) throw notFound(ITEM)

    const next = item.status === "PURCHASED" ? "PENDING" : "PURCHASED"
    await applyItemStatus(tx, where, next, new Date())

    return tx.shoppingItem.findFirstOrThrow({
      where,
      select: SHOPPING_ITEM_RESULT_SELECT,
    })
  })
}

export async function deleteShoppingItem(
  context: ApplicationContext,
  itemId: string
) {
  assertResourceId(itemId, ITEM)
  return scopedWrite({
    resource: ITEM,
    write: () =>
      db.shoppingItem.delete({
        where: visibleItemWhere(context, itemId),
        select: { id: true, listId: true },
      }),
  })
}

/**
 * Deletes one or more items (and their alternatives). Every id must be a
 * visible item, or nothing is deleted and the call is NOT_FOUND. Returns what
 * was deleted so the caller can report it.
 */
export async function deleteShoppingItems(
  context: ApplicationContext,
  itemIds: string[]
) {
  assertBatchSize(itemIds.length, "Varer")
  const ids = [...new Set(itemIds.map((id) => assertResourceId(id, ITEM)))]
  const where = { id: { in: ids }, list: visibleLists(context) }

  return db.$transaction(async (tx) => {
    const items = await tx.shoppingItem.findMany({
      where,
      select: { id: true, name: true, listId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
    if (items.length !== ids.length) throw notFound(ITEM)

    // The boundary is repeated in the delete itself; a row that disappeared
    // or moved out of reach since the read rolls the whole call back.
    const deleted = await tx.shoppingItem.deleteMany({ where })
    if (deleted.count !== ids.length) throw notFound(ITEM)

    return items
  })
}

/**
 * Moves items to another visible list. Both the items and the target list must
 * be visible to the caller; otherwise nothing moves and the call is NOT_FOUND.
 */
export async function moveShoppingItems(
  context: ApplicationContext,
  itemIds: string[],
  targetListId: string
): Promise<ShoppingItemResult[]> {
  assertBatchSize(itemIds.length, "Varer")
  assertResourceId(targetListId, LIST)
  const ids = [...new Set(itemIds.map((id) => assertResourceId(id, ITEM)))]
  const where = { id: { in: ids }, list: visibleLists(context) }

  return db.$transaction(async (tx) => {
    const target = await tx.shoppingList.findFirst({
      where: { ...visibleLists(context), id: targetListId },
      select: { id: true },
    })
    if (!target) throw notFound(LIST)

    // An item already on the target list is matched and left there, so the
    // call sets an end state and a retry is harmless.
    const moved = await tx.shoppingItem.updateMany({
      where,
      data: { listId: targetListId },
    })
    if (moved.count !== ids.length) throw notFound(ITEM)

    return tx.shoppingItem.findMany({
      where: { id: { in: ids }, listId: targetListId },
      select: SHOPPING_ITEM_RESULT_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
  })
}

// ─── Categories ─────────────────────────────────────────────────

export const SHOPPING_CATEGORY_RESULT_SELECT = {
  id: true,
  name: true,
  icon: true,
  color: true,
  isDefault: true,
} satisfies Prisma.CategorySelect

function duplicateCategoryName(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw validationError("En kategori med det navnet finnes allerede.")
  }
  throw error
}

export type ShoppingCategoryFields = {
  name: string
  icon?: string | null
  color?: string | null
}

function normalizeCategoryFields(input: Partial<ShoppingCategoryFields>) {
  return definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    icon: optionalText(input.icon, "Ikon", 50),
    color: optionalText(input.color, "Farge", 50),
  })
}

export async function createShoppingCategory(
  context: ApplicationContext,
  input: ShoppingCategoryFields
) {
  return db.category
    .create({
      data: {
        ...normalizeCategoryFields(input),
        name: requiredText(input.name, "Navn"),
        householdId: context.householdId,
      },
      select: SHOPPING_CATEGORY_RESULT_SELECT,
    })
    .catch(duplicateCategoryName)
}

export async function updateShoppingCategory(
  context: ApplicationContext,
  categoryId: string,
  input: Partial<ShoppingCategoryFields>
) {
  assertResourceId(categoryId, CATEGORY)
  return scopedWrite({
    resource: CATEGORY,
    write: () =>
      db.category
        .update({
          where: { id: categoryId, householdId: context.householdId },
          data: normalizeCategoryFields(input),
          select: SHOPPING_CATEGORY_RESULT_SELECT,
        })
        .catch(duplicateCategoryName),
  })
}

export async function deleteShoppingCategory(
  context: ApplicationContext,
  categoryId: string
) {
  assertResourceId(categoryId, CATEGORY)
  return scopedWrite({
    resource: CATEGORY,
    write: () =>
      db.category.delete({
        where: { id: categoryId, householdId: context.householdId },
        select: { id: true },
      }),
  })
}

// ─── Product alternatives ───────────────────────────────────────

async function findVisibleItem(
  tx: Tx,
  context: ApplicationContext,
  itemId: string
) {
  const item = await tx.shoppingItem.findFirst({
    where: visibleItemWhere(context, itemId),
    select: { id: true, listId: true },
  })
  if (!item) throw notFound(ITEM)
  return item
}

async function readItemResult(tx: Tx, itemId: string) {
  return tx.shoppingItem.findUniqueOrThrow({
    where: { id: itemId },
    select: SHOPPING_ITEM_RESULT_SELECT,
  })
}

export async function addProductAlternative(
  context: ApplicationContext,
  itemId: string,
  input: ProductAlternativeFields
) {
  assertResourceId(itemId, ITEM)
  const fields = {
    ...normalizeAlternativeFields(input),
    name: requiredText(input.name, "Navn"),
  }

  return db.$transaction(async (tx) => {
    const item = await findVisibleItem(tx, context, itemId)

    const { _count, _max } = await tx.productAlternative.aggregate({
      where: { itemId },
      _count: { _all: true },
      _max: { rank: true },
    })
    if (_count._all >= MAX_ALTERNATIVES_PER_ITEM) {
      throw validationError(
        `En vare kan ha maks ${MAX_ALTERNATIVES_PER_ITEM} alternativer.`
      )
    }

    const alternative = await tx.productAlternative.create({
      data: { ...fields, itemId, rank: (_max.rank ?? -1) + 1 },
      select: PRODUCT_ALTERNATIVE_RESULT_SELECT,
    })

    return { alternative, listId: item.listId }
  })
}

export async function updateProductAlternative(
  context: ApplicationContext,
  alternativeId: string,
  input: Partial<ProductAlternativeFields> & { expectedUpdatedAt?: Date }
) {
  assertResourceId(alternativeId, ALTERNATIVE)
  const { expectedUpdatedAt, ...rest } = input
  const fields = normalizeAlternativeFields(rest)
  const scope = visibleAlternativeWhere(context, alternativeId)

  const alternative = await scopedWrite({
    resource: ALTERNATIVE,
    expectedUpdatedAt,
    write: () =>
      db.productAlternative.update({
        where: { ...scope, ...freshness(expectedUpdatedAt) },
        data: fields,
        select: {
          ...PRODUCT_ALTERNATIVE_RESULT_SELECT,
          item: { select: { listId: true } },
        },
      }),
    existsInScope: async () =>
      (await db.productAlternative.count({ where: scope })) > 0,
  })

  const { item, ...result } = alternative
  return { alternative: result, listId: item.listId }
}

export async function deleteProductAlternative(
  context: ApplicationContext,
  alternativeId: string
) {
  assertResourceId(alternativeId, ALTERNATIVE)

  return db.$transaction(async (tx) => {
    const deleted = await scopedWrite({
      resource: ALTERNATIVE,
      write: () =>
        tx.productAlternative.delete({
          where: visibleAlternativeWhere(context, alternativeId),
          select: {
            id: true,
            itemId: true,
            item: { select: { listId: true } },
          },
        }),
    })

    return {
      id: deleted.id,
      itemId: deleted.itemId,
      listId: deleted.item.listId,
      item: await readItemResult(tx, deleted.itemId),
    }
  })
}

async function writeRanks(tx: Tx, itemId: string, orderedIds: string[]) {
  for (const [rank, id] of orderedIds.entries()) {
    // `itemId` in the where keeps every rank write inside the item that was
    // authorized above.
    await tx.productAlternative.update({
      where: { id, itemId },
      data: { rank },
    })
  }
}

/**
 * Moves one alternative to rank 0 and keeps the rest in their current order.
 * Idempotent: choosing the current favourite again changes nothing.
 */
export async function setPreferredAlternative(
  context: ApplicationContext,
  itemId: string,
  alternativeId: string
) {
  assertResourceId(itemId, ITEM)
  assertResourceId(alternativeId, ALTERNATIVE)

  return db.$transaction(async (tx) => {
    const item = await findVisibleItem(tx, context, itemId)
    const alternatives = await tx.productAlternative.findMany({
      where: { itemId },
      select: { id: true, rank: true },
      orderBy: [{ rank: "asc" }, { id: "asc" }],
    })

    if (!alternatives.some((alternative) => alternative.id === alternativeId)) {
      throw notFound(ALTERNATIVE)
    }

    const ordered = [
      alternativeId,
      ...alternatives
        .map((alternative) => alternative.id)
        .filter((id) => id !== alternativeId),
    ]
    const unchanged = ordered.every(
      (id, rank) =>
        alternatives[rank]?.id === id && alternatives[rank]?.rank === rank
    )
    if (!unchanged) await writeRanks(tx, itemId, ordered)

    return { item: await readItemResult(tx, itemId), listId: item.listId }
  })
}

/** Web drag-and-drop. The ids must be exactly the item's alternatives. */
export async function reorderAlternatives(
  context: ApplicationContext,
  itemId: string,
  orderedIds: string[]
) {
  assertResourceId(itemId, ITEM)

  return db.$transaction(async (tx) => {
    const item = await findVisibleItem(tx, context, itemId)
    const alternatives = await tx.productAlternative.findMany({
      where: { itemId },
      select: { id: true },
    })

    const current = new Set(alternatives.map((alternative) => alternative.id))
    const requested = new Set(orderedIds)
    if (
      requested.size !== orderedIds.length ||
      requested.size !== current.size ||
      orderedIds.some((id) => !current.has(id))
    ) {
      throw validationError(
        "Rekkefølgen må inneholde nøyaktig varens alternativer."
      )
    }

    await writeRanks(tx, itemId, orderedIds)
    return { item: await readItemResult(tx, itemId), listId: item.listId }
  })
}
