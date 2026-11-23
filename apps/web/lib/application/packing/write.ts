import { db, PackingDuration, PackingSeason, type Prisma } from "@workspace/db"

import type { ApplicationContext } from "../context"
import { ApplicationError } from "../errors"
import {
  MAX_BATCH_SIZE,
  MAX_LONG_TEXT_LENGTH,
  assertBatchSize,
  definedFields,
  enumValue,
  freshness,
  integerInRange,
  isUniqueConstraintError,
  notFound,
  optionalCalendarDate,
  optionalText,
  requiredText,
  scopedWrite,
  validationError,
} from "../mutations"
import {
  getPackingList,
  packingBundleInclude,
  packingItemOrder,
  type PackingBundleWithItems,
  type PackingListDetail,
} from "./read"
import { bundleFitsTrip, packingItemKey } from "./rules"

/**
 * Packing write services, shared by the web actions and the MCP tools.
 *
 * Items are reached through their list and bundle items through their bundle,
 * so the household boundary in the parent's `where` covers every child id.
 * Adding a bundle to a list copies its items: the list can then be ticked off
 * and edited freely, and a later change to the bundle does not rewrite lists
 * that were already packed.
 */

const LIST = "pakkeliste"
const ITEM = "ting"
const BUNDLE = "pakke"

const SEASON_VALUES = Object.values(PackingSeason)
const DURATION_VALUES = Object.values(PackingDuration)

/** More than this of one thing is a typo, not luggage. */
export const MAX_PACKING_QUANTITY = 999

/** A list or bundle holds at most this many things. */
export const MAX_PACKING_ITEMS = 300

const BATCH_TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 }

type Tx = Prisma.TransactionClient

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertResourceId(value: string, resource: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw notFound(resource)
  }
  return value
}

function assertResourceIds(values: string[], resource: string) {
  if (!Array.isArray(values)) {
    throw validationError("ID-ene må være en liste.")
  }
  for (const value of values) assertResourceId(value, resource)
  return [...new Set(values)]
}

/** Prefixes the position in a batch, so the caller knows which row failed. */
function inBatch<T>(index: number, label: string, run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw new ApplicationError(
        error.code,
        `${label} ${index + 1}: ${error.message}`
      )
    }
    throw error
  }
}

// ─── Field normalization ────────────────────────────────────────

export type PackingListFields = {
  name: string
  season?: PackingSeason | null
  duration?: PackingDuration | null
  abroad?: boolean
  /** `Date` from the web flow, `YYYY-MM-DD` from MCP. */
  departureOn?: Date | string | null
  notes?: string | null
}

export type PackingItemFields = {
  name: string
  quantity?: number
  notes?: string | null
}

export type PackingBundleFields = {
  name: string
  description?: string | null
  seasons?: PackingSeason[]
  durations?: PackingDuration[]
  abroadOnly?: boolean
  autoAdd?: boolean
}

function optionalBoolean(value: unknown, field: string) {
  if (value !== undefined && typeof value !== "boolean") {
    throw validationError(`${field} må være sann eller usann.`)
  }
  return value as boolean | undefined
}

function optionalEnum<T extends string>(
  value: T | null | undefined,
  allowed: readonly T[],
  field: string
): T | null | undefined {
  return value == null ? value : enumValue(value, allowed, field)
}

function enumList<T extends string>(
  values: T[] | undefined,
  allowed: readonly T[],
  field: string
): T[] | undefined {
  if (values === undefined) return undefined
  if (!Array.isArray(values)) {
    throw validationError(`${field} må være en liste.`)
  }
  const unique = [...new Set(values.map((v) => enumValue(v, allowed, field)))]
  // Stored in the enum's own order, so equal sets compare equal.
  return allowed.filter((value) => unique.includes(value))
}

function normalizeListFields(input: Partial<PackingListFields>) {
  return definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    season: optionalEnum(input.season, SEASON_VALUES, "Sesong"),
    duration: optionalEnum(input.duration, DURATION_VALUES, "Varighet"),
    abroad: optionalBoolean(input.abroad, "Utenlands"),
    departureOn: optionalCalendarDate(input.departureOn, "Avreise"),
    notes: optionalText(input.notes, "Notater", MAX_LONG_TEXT_LENGTH),
  })
}

function quantity(value: number | undefined) {
  return value === undefined
    ? undefined
    : integerInRange(value, "Antall", { min: 1, max: MAX_PACKING_QUANTITY })
}

function normalizeItem(input: PackingItemFields) {
  return {
    name: requiredText(input.name, "Navn"),
    quantity: quantity(input.quantity) ?? 1,
    notes: optionalText(input.notes, "Notat") ?? null,
  }
}

function normalizeBundleFields(input: Partial<PackingBundleFields>) {
  return definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    description: optionalText(input.description, "Beskrivelse"),
    seasons: enumList(input.seasons, SEASON_VALUES, "Sesong"),
    durations: enumList(input.durations, DURATION_VALUES, "Varighet"),
    abroadOnly: optionalBoolean(input.abroadOnly, "Bare utenlands"),
    autoAdd: optionalBoolean(input.autoAdd, "Legg til automatisk"),
  })
}

function normalizeBundleItems(items: PackingItemFields[]) {
  if (!Array.isArray(items)) {
    throw validationError("Tingene må være en liste.")
  }
  if (items.length > MAX_BATCH_SIZE) {
    throw validationError(`En pakke kan ha maks ${MAX_BATCH_SIZE} ting.`)
  }
  const seen = new Set<string>()
  return items.map((item, index) =>
    inBatch(index, "Ting", () => {
      const normalized = normalizeItem(item)
      const key = packingItemKey(normalized.name)
      if (seen.has(key)) {
        throw validationError(`«${normalized.name}» står to ganger i pakken.`)
      }
      seen.add(key)
      return { ...normalized, sortOrder: index }
    })
  )
}

/**
 * The unique index is case-sensitive; this catches "badetøy" next to
 * "Badetøy". The index stays the backstop for two writes at once.
 */
async function assertBundleNameFree(
  context: ApplicationContext,
  name: string | undefined,
  exceptId?: string
) {
  if (name === undefined) return
  const taken = await db.packingBundle.count({
    where: {
      householdId: context.householdId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  })
  if (taken > 0) throw duplicateBundleName()
}

function duplicateBundleName() {
  return new ApplicationError(
    "CONFLICT",
    "Det finnes allerede en pakke med det navnet."
  )
}

// ─── Copying items into a list ──────────────────────────────────

type NewListItem = {
  name: string
  quantity: number
  notes: string | null
  bundleId: string | null
}

export type SkippedPackingItem = {
  name: string
  /** The item already on the list under this name. */
  existingItemId: string
}

/**
 * Appends items after the list's last item. A name already on the list, or
 * earlier in the same call, is skipped and reported: two bundles that both
 * hold "Ladekabel" give one charger, not two.
 */
async function appendItems(
  tx: Tx,
  listId: string,
  entries: NewListItem[],
  { onDuplicate = "skip" }: { onDuplicate?: "skip" | "create" } = {}
) {
  const existing = await tx.packingItem.findMany({
    where: { listId },
    select: { id: true, name: true, sortOrder: true },
    orderBy: packingItemOrder,
  })
  if (existing.length + entries.length > MAX_PACKING_ITEMS) {
    const room = MAX_PACKING_ITEMS - existing.length
    // Duplicates would be skipped, so only fail when the new names overflow.
    const fresh = new Set(
      entries
        .map((entry) => packingItemKey(entry.name))
        .filter(
          (key) => !existing.some((item) => packingItemKey(item.name) === key)
        )
    )
    if (fresh.size > room) {
      throw validationError(
        `En pakkeliste kan ha maks ${MAX_PACKING_ITEMS} ting.`
      )
    }
  }

  const known = new Map<string, string>()
  for (const item of existing) {
    const key = packingItemKey(item.name)
    if (!known.has(key)) known.set(key, item.id)
  }

  let sortOrder = existing.reduce(
    (max, item) => Math.max(max, item.sortOrder),
    -1
  )
  const createdIds: string[] = []
  const skipped: SkippedPackingItem[] = []

  for (const entry of entries) {
    const key = packingItemKey(entry.name)
    const existingItemId = known.get(key)
    if (onDuplicate === "skip" && existingItemId) {
      skipped.push({ name: entry.name, existingItemId })
      continue
    }

    sortOrder += 1
    const created = await tx.packingItem.create({
      data: { ...entry, listId, sortOrder },
      select: { id: true },
    })
    createdIds.push(created.id)
    if (!known.has(key)) known.set(key, created.id)
  }

  return { createdIds, skipped }
}

/** Bundles in the household, in the given order. Unknown ids are NOT_FOUND. */
async function loadBundles(
  tx: Tx,
  context: ApplicationContext,
  bundleIds: string[]
) {
  if (bundleIds.length === 0) return []
  const bundles = await tx.packingBundle.findMany({
    where: { id: { in: bundleIds }, householdId: context.householdId },
    include: packingBundleInclude,
  })
  if (bundles.length !== bundleIds.length) throw notFound(BUNDLE)
  return bundleIds.map((id) => bundles.find((bundle) => bundle.id === id)!)
}

function bundleEntries(bundles: PackingBundleWithItems[]): NewListItem[] {
  return bundles.flatMap((bundle) =>
    bundle.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
      bundleId: bundle.id,
    }))
  )
}

export type PackingChangeResult = {
  list: PackingListDetail
  /** Bundles whose items were copied in by this call. */
  addedBundles: Array<{ id: string; name: string }>
  createdItemIds: string[]
  skipped: SkippedPackingItem[]
}

async function reloadList(context: ApplicationContext, listId: string) {
  const list = await getPackingList(context, listId)
  if (!list) throw notFound(LIST)
  return list
}

// ─── Lists ──────────────────────────────────────────────────────

export type CreatePackingListInput = PackingListFields & {
  /** Bundles to add, in order. */
  bundleIds?: string[]
  /**
   * Also add every bundle marked "legg til automatisk" that fits the trip's
   * season, duration and abroad flag. Defaults to true.
   */
  applyAutoBundles?: boolean
  /** Loose items, added after the bundles. */
  items?: PackingItemFields[]
}

export async function createPackingList(
  context: ApplicationContext,
  input: CreatePackingListInput
): Promise<PackingChangeResult> {
  const fields = normalizeListFields(input)
  const name = requiredText(input.name, "Navn")
  const bundleIds = assertResourceIds(input.bundleIds ?? [], BUNDLE)
  const items = (input.items ?? []).map((item, index) =>
    inBatch(index, "Ting", () => normalizeItem(item))
  )
  if (items.length > MAX_PACKING_ITEMS) {
    throw validationError(
      `En pakkeliste kan ha maks ${MAX_PACKING_ITEMS} ting.`
    )
  }
  const applyAutoBundles =
    optionalBoolean(input.applyAutoBundles, "Automatiske pakker") ?? true

  const result = await db.$transaction(async (tx) => {
    const list = await tx.packingList.create({
      data: { ...fields, name, householdId: context.householdId },
      select: { id: true, season: true, duration: true, abroad: true },
    })

    const chosen = await loadBundles(tx, context, bundleIds)
    const automatic = applyAutoBundles
      ? (
          await tx.packingBundle.findMany({
            where: {
              householdId: context.householdId,
              autoAdd: true,
              id: { notIn: bundleIds },
            },
            include: packingBundleInclude,
            orderBy: [{ name: "asc" }, { id: "asc" }],
          })
        ).filter((bundle) => bundleFitsTrip(bundle, list))
      : []
    const bundles = [...chosen, ...automatic]

    const appended = await appendItems(tx, list.id, [
      ...bundleEntries(bundles),
      ...items.map((item) => ({ ...item, bundleId: null })),
    ])

    return {
      listId: list.id,
      addedBundles: bundles.map(({ id, name }) => ({ id, name })),
      ...appended,
    }
  }, BATCH_TRANSACTION_OPTIONS)

  return {
    list: await reloadList(context, result.listId),
    addedBundles: result.addedBundles,
    createdItemIds: result.createdIds,
    skipped: result.skipped,
  }
}

export async function updatePackingList(
  context: ApplicationContext,
  listId: string,
  input: Partial<PackingListFields> & { expectedUpdatedAt?: Date }
): Promise<PackingListDetail> {
  assertResourceId(listId, LIST)
  const { expectedUpdatedAt, ...rest } = input
  const fields = normalizeListFields(rest)
  const scope = { id: listId, householdId: context.householdId }

  await scopedWrite({
    resource: LIST,
    expectedUpdatedAt,
    write: () =>
      db.packingList.update({
        where: { ...scope, ...freshness(expectedUpdatedAt) },
        data: fields,
        select: { id: true },
      }),
    existsInScope: async () =>
      (await db.packingList.count({ where: scope })) > 0,
  })

  return reloadList(context, listId)
}

export async function deletePackingList(
  context: ApplicationContext,
  listId: string
) {
  assertResourceId(listId, LIST)
  return scopedWrite({
    resource: LIST,
    write: () =>
      db.packingList.delete({
        where: { id: listId, householdId: context.householdId },
        select: { id: true, name: true },
      }),
  })
}

/**
 * Copies a list with its items, nothing packed: last summer's cabin trip as
 * the start of this summer's.
 */
export async function duplicatePackingList(
  context: ApplicationContext,
  listId: string,
  input: { name?: string; departureOn?: Date | string | null } = {}
): Promise<PackingListDetail> {
  assertResourceId(listId, LIST)
  const name =
    input.name === undefined ? undefined : requiredText(input.name, "Navn")
  const departureOn = optionalCalendarDate(input.departureOn, "Avreise")

  const copyId = await db.$transaction(async (tx) => {
    const source = await tx.packingList.findFirst({
      where: { id: listId, householdId: context.householdId },
      include: { items: { orderBy: packingItemOrder } },
    })
    if (!source) throw notFound(LIST)

    const copy = await tx.packingList.create({
      data: {
        householdId: context.householdId,
        name: name ?? `${source.name} (kopi)`,
        season: source.season,
        duration: source.duration,
        abroad: source.abroad,
        departureOn: departureOn === undefined ? null : departureOn,
        notes: source.notes,
        items: {
          create: source.items.map((item, index) => ({
            name: item.name,
            quantity: item.quantity,
            notes: item.notes,
            bundleId: item.bundleId,
            sortOrder: index,
          })),
        },
      },
      select: { id: true },
    })
    return copy.id
  }, BATCH_TRANSACTION_OPTIONS)

  return reloadList(context, copyId)
}

// ─── Items ──────────────────────────────────────────────────────

export async function addPackingItems(
  context: ApplicationContext,
  listId: string,
  items: PackingItemFields[],
  options: { onDuplicate?: "skip" | "create" } = {}
): Promise<PackingChangeResult> {
  assertResourceId(listId, LIST)
  assertBatchSize(items.length, "Ting")
  const normalized = items.map((item, index) =>
    inBatch(index, "Ting", () => normalizeItem(item))
  )

  const appended = await db.$transaction(async (tx) => {
    const list = await tx.packingList.findFirst({
      where: { id: listId, householdId: context.householdId },
      select: { id: true },
    })
    if (!list) throw notFound(LIST)

    return appendItems(
      tx,
      list.id,
      normalized.map((item) => ({ ...item, bundleId: null })),
      options
    )
  }, BATCH_TRANSACTION_OPTIONS)

  return {
    list: await reloadList(context, listId),
    addedBundles: [],
    createdItemIds: appended.createdIds,
    skipped: appended.skipped,
  }
}

export async function updatePackingItem(
  context: ApplicationContext,
  itemId: string,
  input: Partial<PackingItemFields> & {
    packed?: boolean
    expectedUpdatedAt?: Date
  }
) {
  assertResourceId(itemId, ITEM)
  const data = definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    quantity: quantity(input.quantity),
    notes: optionalText(input.notes, "Notat"),
    packed: optionalBoolean(input.packed, "Pakket"),
  })
  const scope = { id: itemId, list: { householdId: context.householdId } }

  return scopedWrite({
    resource: ITEM,
    expectedUpdatedAt: input.expectedUpdatedAt,
    write: () =>
      db.packingItem.update({
        where: { ...scope, ...freshness(input.expectedUpdatedAt) },
        data,
        include: { bundle: { select: { id: true, name: true } } },
      }),
    existsInScope: async () =>
      (await db.packingItem.count({ where: scope })) > 0,
  })
}

/**
 * Ticks items off, or clears them. Without `itemIds` it applies to the whole
 * list, e.g. to unpack everything before the next trip. Every id must be on
 * the list, or nothing changes.
 */
export async function setPackingItemsPacked(
  context: ApplicationContext,
  listId: string,
  input: { packed: boolean; itemIds?: string[] }
) {
  assertResourceId(listId, LIST)
  if (typeof input.packed !== "boolean") {
    throw validationError("Pakket må være sann eller usann.")
  }
  const itemIds =
    input.itemIds === undefined
      ? undefined
      : assertResourceIds(input.itemIds, ITEM)
  if (itemIds) assertBatchSize(itemIds.length, "Ting")

  const changed = await db.$transaction(async (tx) => {
    const list = await tx.packingList.findFirst({
      where: { id: listId, householdId: context.householdId },
      select: { id: true },
    })
    if (!list) throw notFound(LIST)

    const result = await tx.packingItem.updateMany({
      where: { listId, ...(itemIds ? { id: { in: itemIds } } : {}) },
      data: { packed: input.packed },
    })
    if (itemIds && result.count !== itemIds.length) throw notFound(ITEM)
    return result.count
  })

  return { changedCount: changed, list: await reloadList(context, listId) }
}

/** Removes items from their lists. All ids must be in the household. */
export async function deletePackingItems(
  context: ApplicationContext,
  itemIds: string[]
) {
  const ids = assertResourceIds(itemIds, ITEM)
  assertBatchSize(ids.length, "Ting")

  return db.$transaction(async (tx) => {
    const result = await tx.packingItem.deleteMany({
      where: { id: { in: ids }, list: { householdId: context.householdId } },
    })
    if (result.count !== ids.length) throw notFound(ITEM)
    return { deletedCount: result.count }
  })
}

// ─── Bundles on a list ──────────────────────────────────────────

/** Copies the bundles' items into the list, skipping names already there. */
export async function addBundlesToList(
  context: ApplicationContext,
  listId: string,
  bundleIds: string[]
): Promise<PackingChangeResult> {
  assertResourceId(listId, LIST)
  const ids = assertResourceIds(bundleIds, BUNDLE)
  assertBatchSize(ids.length, "Pakker")

  const result = await db.$transaction(async (tx) => {
    const list = await tx.packingList.findFirst({
      where: { id: listId, householdId: context.householdId },
      select: { id: true },
    })
    if (!list) throw notFound(LIST)

    const bundles = await loadBundles(tx, context, ids)
    const appended = await appendItems(tx, list.id, bundleEntries(bundles))
    return {
      addedBundles: bundles.map(({ id, name }) => ({ id, name })),
      ...appended,
    }
  }, BATCH_TRANSACTION_OPTIONS)

  return {
    list: await reloadList(context, listId),
    addedBundles: result.addedBundles,
    createdItemIds: result.createdIds,
    skipped: result.skipped,
  }
}

/**
 * Takes a bundle's items off a list again. With `keepPacked` the items already
 * packed stay, since someone has put them in the bag.
 */
export async function removeBundleFromList(
  context: ApplicationContext,
  listId: string,
  bundleId: string,
  { keepPacked = false }: { keepPacked?: boolean } = {}
) {
  assertResourceId(listId, LIST)
  assertResourceId(bundleId, BUNDLE)

  const deleted = await db.$transaction(async (tx) => {
    const list = await tx.packingList.findFirst({
      where: { id: listId, householdId: context.householdId },
      select: { id: true },
    })
    if (!list) throw notFound(LIST)

    const result = await tx.packingItem.deleteMany({
      where: { listId, bundleId, ...(keepPacked ? { packed: false } : {}) },
    })
    return result.count
  })

  return { deletedCount: deleted, list: await reloadList(context, listId) }
}

// ─── Bundles ────────────────────────────────────────────────────

export type CreatePackingBundleInput = PackingBundleFields & {
  items?: PackingItemFields[]
}

export async function createPackingBundle(
  context: ApplicationContext,
  input: CreatePackingBundleInput
): Promise<PackingBundleWithItems> {
  const fields = normalizeBundleFields(input)
  const items = normalizeBundleItems(input.items ?? [])
  const name = requiredText(input.name, "Navn")
  await assertBundleNameFree(context, name)

  try {
    return await db.packingBundle.create({
      data: {
        ...fields,
        name,
        householdId: context.householdId,
        items: { create: items },
      },
      include: packingBundleInclude,
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) throw duplicateBundleName()
    throw error
  }
}

export type UpdatePackingBundleInput = Partial<PackingBundleFields> & {
  /**
   * The complete list of things in the bundle after the call. Things left out
   * are removed from the bundle (not from lists it was already added to).
   * Omit to leave the items alone.
   */
  items?: PackingItemFields[]
  expectedUpdatedAt?: Date
}

export async function updatePackingBundle(
  context: ApplicationContext,
  bundleId: string,
  input: UpdatePackingBundleInput
): Promise<PackingBundleWithItems> {
  assertResourceId(bundleId, BUNDLE)
  const { expectedUpdatedAt, items: rawItems, ...rest } = input
  const fields = normalizeBundleFields(rest)
  const items =
    rawItems === undefined ? undefined : normalizeBundleItems(rawItems)
  const scope = { id: bundleId, householdId: context.householdId }
  await assertBundleNameFree(context, fields.name, bundleId)

  try {
    return await scopedWrite({
      resource: BUNDLE,
      expectedUpdatedAt,
      write: () =>
        db.packingBundle.update({
          where: { ...scope, ...freshness(expectedUpdatedAt) },
          data: {
            ...fields,
            ...(items
              ? {
                  // Written through the bundle, so the boundary covers them.
                  items: { deleteMany: {}, create: items },
                  updatedAt: new Date(),
                }
              : {}),
          },
          include: packingBundleInclude,
        }),
      existsInScope: async () =>
        (await db.packingBundle.count({ where: scope })) > 0,
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) throw duplicateBundleName()
    throw error
  }
}

/** Deletes the bundle. Items already copied into lists stay on them. */
export async function deletePackingBundle(
  context: ApplicationContext,
  bundleId: string
) {
  assertResourceId(bundleId, BUNDLE)
  return scopedWrite({
    resource: BUNDLE,
    write: () =>
      db.packingBundle.delete({
        where: { id: bundleId, householdId: context.householdId },
        select: { id: true, name: true },
      }),
  })
}
