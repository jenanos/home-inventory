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
  packingItemRelations,
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
const PERSON = "person"

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

/** A thing on a list: a bundle item's fields, and who it is for. */
export type PackingListItemFields = PackingItemFields & {
  /** A person from listPackingPersons; null or omitted means shared. */
  personId?: string | null
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

function normalizeListItem(input: PackingListItemFields) {
  return {
    ...normalizeItem(input),
    personId: optionalPersonId(input.personId) ?? null,
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

// ─── People ─────────────────────────────────────────────────────

/** `undefined` leaves the person alone, `null` clears it. */
function optionalPersonId(value: string | null | undefined) {
  return value == null ? value : assertResourceId(value, PERSON)
}

/** Every person must be in the household; unknown ids are NOT_FOUND. */
async function assertPersonsInHousehold(
  tx: Tx,
  context: ApplicationContext,
  personIds: Array<string | null | undefined>
) {
  const ids = [
    ...new Set(personIds.filter((id): id is string => typeof id === "string")),
  ]
  if (ids.length === 0) return
  const found = await tx.packingPerson.count({
    where: { id: { in: ids }, householdId: context.householdId },
  })
  if (found !== ids.length) throw notFound(PERSON)
}

// ─── Copying items into a list ──────────────────────────────────

type NewListItem = {
  name: string
  quantity: number
  notes: string | null
  bundleId: string | null
  personId: string | null
}

/** The same thing for the same person; Ola's and Kari's mittens are two. */
function itemKey(item: { name: string; personId: string | null }) {
  return `${item.personId ?? ""}\u0000${packingItemKey(item.name)}`
}

export type SkippedPackingItem = {
  name: string
  /** The item already on the list under this name. */
  existingItemId: string
}

/**
 * Appends items after the list's last item. The same thing for the same
 * person, already on the list or earlier in the same call, is skipped and
 * reported: two bundles that both hold "Ladekabel" give one charger, not two.
 */
async function appendItems(
  tx: Tx,
  listId: string,
  entries: NewListItem[],
  { onDuplicate = "skip" }: { onDuplicate?: "skip" | "create" } = {}
) {
  const existing = await tx.packingItem.findMany({
    where: { listId },
    select: { id: true, name: true, personId: true, sortOrder: true },
    orderBy: packingItemOrder,
  })

  const known = new Map<string, string>()
  for (const item of existing) {
    const key = itemKey(item)
    if (!known.has(key)) known.set(key, item.id)
  }

  // In "create" mode every entry becomes a row; in "skip" mode only the
  // distinct things not already on the list do.
  const added =
    onDuplicate === "create"
      ? entries.length
      : new Set(entries.map(itemKey).filter((key) => !known.has(key))).size
  if (existing.length + added > MAX_PACKING_ITEMS) {
    throw validationError(
      `En pakkeliste kan ha maks ${MAX_PACKING_ITEMS} ting.`
    )
  }

  let sortOrder = existing.reduce(
    (max, item) => Math.max(max, item.sortOrder),
    -1
  )
  const createdIds: string[] = []
  const skipped: SkippedPackingItem[] = []

  for (const entry of entries) {
    const key = itemKey(entry)
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
  // The same bundle may come twice, once per person.
  const unique = [...new Set(bundleIds)]
  const bundles = await tx.packingBundle.findMany({
    where: { id: { in: unique }, householdId: context.householdId },
    include: packingBundleInclude,
  })
  if (bundles.length !== unique.length) throw notFound(BUNDLE)
  return bundleIds.map((id) => bundles.find((bundle) => bundle.id === id)!)
}

/** A bundle to copy in, and who its things are for (null: shared). */
type BundlePlacement = {
  bundle: PackingBundleWithItems
  personId: string | null
}

function bundleEntries(placements: BundlePlacement[]): NewListItem[] {
  return placements.flatMap(({ bundle, personId }) =>
    bundle.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
      bundleId: bundle.id,
      personId,
    }))
  )
}

function addedBundles(placements: BundlePlacement[]) {
  return placements.map(({ bundle, personId }) => ({
    id: bundle.id,
    name: bundle.name,
    personId,
  }))
}

export type BundleRequest = {
  bundleId: string
  /** Copy the bundle's things for this person. Omit for shared things. */
  personId?: string | null
}

function normalizeBundleRequests(requests: BundleRequest[]) {
  if (!Array.isArray(requests)) {
    throw validationError("Pakkene må være en liste.")
  }
  return requests.map((request) => ({
    bundleId: assertResourceId(request?.bundleId, BUNDLE),
    personId: optionalPersonId(request.personId) ?? null,
  }))
}

export type PackingChangeResult = {
  list: PackingListDetail
  /** Bundles whose items were copied in by this call, and for whom. */
  addedBundles: Array<{ id: string; name: string; personId: string | null }>
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
  /** Bundles to add, in order, as shared things. */
  bundleIds?: string[]
  /** Bundles to add for a person, e.g. "Vintertøy barn" once per child. */
  bundles?: BundleRequest[]
  /**
   * Also add every bundle marked "legg til automatisk" that fits the trip's
   * season, duration and abroad flag. Defaults to true.
   */
  applyAutoBundles?: boolean
  /** Loose items, added after the bundles. */
  items?: PackingListItemFields[]
}

export async function createPackingList(
  context: ApplicationContext,
  input: CreatePackingListInput
): Promise<PackingChangeResult> {
  const fields = normalizeListFields(input)
  const name = requiredText(input.name, "Navn")
  const requests = [
    ...assertResourceIds(input.bundleIds ?? [], BUNDLE).map((bundleId) => ({
      bundleId,
      personId: null,
    })),
    ...normalizeBundleRequests(input.bundles ?? []),
  ]
  if (requests.length > MAX_BATCH_SIZE) {
    throw validationError(`Maks ${MAX_BATCH_SIZE} pakker per kall.`)
  }
  const items = (input.items ?? []).map((item, index) =>
    inBatch(index, "Ting", () => normalizeListItem(item))
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

    await assertPersonsInHousehold(tx, context, [
      ...requests.map((request) => request.personId),
      ...items.map((item) => item.personId),
    ])
    const bundleIds = requests.map((request) => request.bundleId)
    const chosen = (await loadBundles(tx, context, bundleIds)).map(
      (bundle, index) => ({ bundle, personId: requests[index]!.personId })
    )
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
        )
          .filter((bundle) => bundleFitsTrip(bundle, list))
          .map((bundle) => ({ bundle, personId: null }))
      : []
    const placements = [...chosen, ...automatic]

    const appended = await appendItems(tx, list.id, [
      ...bundleEntries(placements),
      ...items.map((item) => ({ ...item, bundleId: null })),
    ])

    return {
      listId: list.id,
      addedBundles: addedBundles(placements),
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
            personId: item.personId,
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
  items: PackingListItemFields[],
  options: { onDuplicate?: "skip" | "create" } = {}
): Promise<PackingChangeResult> {
  assertResourceId(listId, LIST)
  assertBatchSize(items.length, "Ting")
  const normalized = items.map((item, index) =>
    inBatch(index, "Ting", () => normalizeListItem(item))
  )

  const appended = await db.$transaction(async (tx) => {
    const list = await tx.packingList.findFirst({
      where: { id: listId, householdId: context.householdId },
      select: { id: true },
    })
    if (!list) throw notFound(LIST)
    await assertPersonsInHousehold(
      tx,
      context,
      normalized.map((item) => item.personId)
    )

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
  input: Partial<PackingListItemFields> & {
    packed?: boolean
    expectedUpdatedAt?: Date
  }
) {
  assertResourceId(itemId, ITEM)
  const personId = optionalPersonId(input.personId)
  const data = definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    quantity: quantity(input.quantity),
    notes: optionalText(input.notes, "Notat"),
    packed: optionalBoolean(input.packed, "Pakket"),
    personId,
  })
  const scope = { id: itemId, list: { householdId: context.householdId } }

  return scopedWrite({
    resource: ITEM,
    expectedUpdatedAt: input.expectedUpdatedAt,
    write: () =>
      db.$transaction(async (tx) => {
        await assertPersonsInHousehold(tx, context, [personId])
        return tx.packingItem.update({
          where: { ...scope, ...freshness(input.expectedUpdatedAt) },
          data,
          include: packingItemRelations,
        })
      }),
    existsInScope: async () =>
      (await db.packingItem.count({ where: scope })) > 0,
  })
}

/**
 * Ticks items off, or clears them. Without `itemIds` it applies to the whole
 * list, e.g. to unpack everything before the next trip, or to everything for
 * one person (`personId`; `null` for the shared things). Every id must be on
 * the list, or nothing changes.
 */
export async function setPackingItemsPacked(
  context: ApplicationContext,
  listId: string,
  input: { packed: boolean; itemIds?: string[]; personId?: string | null }
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
  const personId = optionalPersonId(input.personId)

  const changed = await db.$transaction(async (tx) => {
    const list = await tx.packingList.findFirst({
      where: { id: listId, householdId: context.householdId },
      select: { id: true },
    })
    if (!list) throw notFound(LIST)

    const result = await tx.packingItem.updateMany({
      where: {
        listId,
        ...(itemIds ? { id: { in: itemIds } } : {}),
        ...(personId !== undefined ? { personId } : {}),
      },
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

/**
 * Copies the bundles' items into the list, for one person or as shared
 * things, skipping what that person already has on the list.
 */
export async function addBundlesToList(
  context: ApplicationContext,
  listId: string,
  bundleIds: string[],
  options: { personId?: string | null } = {}
): Promise<PackingChangeResult> {
  assertResourceId(listId, LIST)
  const ids = assertResourceIds(bundleIds, BUNDLE)
  assertBatchSize(ids.length, "Pakker")
  const personId = optionalPersonId(options.personId) ?? null

  const result = await db.$transaction(async (tx) => {
    const list = await tx.packingList.findFirst({
      where: { id: listId, householdId: context.householdId },
      select: { id: true },
    })
    if (!list) throw notFound(LIST)

    await assertPersonsInHousehold(tx, context, [personId])
    const placements = (await loadBundles(tx, context, ids)).map((bundle) => ({
      bundle,
      personId,
    }))
    const appended = await appendItems(tx, list.id, bundleEntries(placements))
    return { addedBundles: addedBundles(placements), ...appended }
  }, BATCH_TRANSACTION_OPTIONS)

  return {
    list: await reloadList(context, listId),
    addedBundles: result.addedBundles,
    createdItemIds: result.createdIds,
    skipped: result.skipped,
  }
}

/**
 * Takes a bundle's items off a list again: for everyone, or only for one
 * person (`personId`; `null` for the shared copy). With `keepPacked` the items
 * already packed stay, since someone has put them in the bag.
 */
export async function removeBundleFromList(
  context: ApplicationContext,
  listId: string,
  bundleId: string,
  {
    keepPacked = false,
    personId: rawPersonId,
  }: { keepPacked?: boolean; personId?: string | null } = {}
) {
  assertResourceId(listId, LIST)
  assertResourceId(bundleId, BUNDLE)
  const personId = optionalPersonId(rawPersonId)

  const deleted = await db.$transaction(async (tx) => {
    const list = await tx.packingList.findFirst({
      where: { id: listId, householdId: context.householdId },
      select: { id: true },
    })
    if (!list) throw notFound(LIST)

    const result = await tx.packingItem.deleteMany({
      where: {
        listId,
        bundleId,
        ...(keepPacked ? { packed: false } : {}),
        ...(personId !== undefined ? { personId } : {}),
      },
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

// ─── People ─────────────────────────────────────────────────────

const PERSON_SELECT = { id: true, name: true, updatedAt: true } as const

function duplicatePersonName() {
  return new ApplicationError(
    "CONFLICT",
    "Det finnes allerede en person med det navnet."
  )
}

/** Case-insensitive, like bundle names; the unique index is the backstop. */
async function assertPersonNameFree(
  context: ApplicationContext,
  name: string,
  exceptId?: string
) {
  const taken = await db.packingPerson.count({
    where: {
      householdId: context.householdId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  })
  if (taken > 0) throw duplicatePersonName()
}

/** Someone to pack for. They need not use the app, e.g. a child. */
export async function createPackingPerson(
  context: ApplicationContext,
  input: { name: string }
) {
  const name = requiredText(input.name, "Navn")
  await assertPersonNameFree(context, name)

  try {
    return await db.packingPerson.create({
      data: { name, householdId: context.householdId },
      select: PERSON_SELECT,
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) throw duplicatePersonName()
    throw error
  }
}

export async function updatePackingPerson(
  context: ApplicationContext,
  personId: string,
  input: { name: string; expectedUpdatedAt?: Date }
) {
  assertResourceId(personId, PERSON)
  const name = requiredText(input.name, "Navn")
  const scope = { id: personId, householdId: context.householdId }
  await assertPersonNameFree(context, name, personId)

  try {
    return await scopedWrite({
      resource: PERSON,
      expectedUpdatedAt: input.expectedUpdatedAt,
      write: () =>
        db.packingPerson.update({
          where: { ...scope, ...freshness(input.expectedUpdatedAt) },
          data: { name },
          select: PERSON_SELECT,
        }),
      existsInScope: async () =>
        (await db.packingPerson.count({ where: scope })) > 0,
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) throw duplicatePersonName()
    throw error
  }
}

/** Deletes the person. Their things stay on the lists, as shared things. */
export async function deletePackingPerson(
  context: ApplicationContext,
  personId: string
) {
  assertResourceId(personId, PERSON)
  return scopedWrite({
    resource: PERSON,
    write: () =>
      db.packingPerson.delete({
        where: { id: personId, householdId: context.householdId },
        select: { id: true, name: true },
      }),
  })
}
