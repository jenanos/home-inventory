import {
  db,
  PackingDuration,
  PackingListKind,
  PackingSeason,
  type Prisma,
} from "@workspace/db"

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
  packingGroupOrder,
  packingItemRelations,
  packingItemOrder,
  type PackingBundleWithItems,
  type PackingListDetail,
} from "./read"
import {
  DURATION_QUANTITY_FIELD,
  bundleFitsTrip,
  packingItemKey,
  quantityForTrip,
  type DurationQuantities,
} from "./rules"

/**
 * Packing write services, shared by the web actions and the MCP tools.
 *
 * Items are reached through their list and bundle items through their bundle,
 * so the household boundary in the parent's `where` covers every child id.
 * Adding a bundle to a list copies its items: the list can then be ticked off
 * and edited freely, and a later change to the bundle does not rewrite lists
 * that were already packed. Templates can be brought up to date on request
 * with `syncBundleToTemplates`; trips and finished trips never are (ADR 0017).
 */

const LIST = "pakkeliste"
const ITEM = "ting"
const BUNDLE = "pakke"
const PERSON = "person"
const GROUP = "underliste"

const SEASON_VALUES = Object.values(PackingSeason)
const DURATION_VALUES = Object.values(PackingDuration)
const KIND_VALUES = Object.values(PackingListKind)

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
  /** TEMPLATE, TRIP (default) or ARCHIVED. */
  kind?: PackingListKind
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
  /** A sub-list on the same list; null or omitted means none. */
  groupId?: string | null
}

/** How many to pack per trip length; null or omitted uses `quantity`. */
export type QuantityByDuration = Partial<Record<PackingDuration, number | null>>

/** A thing in a bundle. */
export type PackingBundleItemFields = PackingItemFields & {
  /**
   * The bundle item this replaces, when updating a bundle. Lets a rename keep
   * its link to the lists the item is on; without it items match by name.
   */
  id?: string
  quantityByDuration?: QuantityByDuration
}

export type PackingBundleFields = {
  name: string
  description?: string | null
  seasons?: PackingSeason[]
  durations?: PackingDuration[]
  abroadOnly?: boolean
  autoAdd?: boolean
  /**
   * Whose bundle it is ("Astrids toalettsaker"). Its things go to this person
   * when the bundle is added without naming someone else; null: shared.
   */
  personId?: string | null
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
    kind:
      input.kind === undefined
        ? undefined
        : enumValue(input.kind, KIND_VALUES, "Type"),
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
    groupId: optionalGroupId(input.groupId) ?? null,
  }
}

/** The four per-length columns, each null when the length has no own number. */
function normalizeQuantityByDuration(
  value: QuantityByDuration | undefined,
  base: number
) {
  if (value !== undefined && (typeof value !== "object" || value === null)) {
    throw validationError("Antall per varighet må være et objekt.")
  }
  const columns = {} as Record<
    (typeof DURATION_QUANTITY_FIELD)[PackingDuration],
    number | null
  >
  for (const duration of DURATION_VALUES) {
    const raw = value?.[duration]
    const count =
      raw == null
        ? null
        : integerInRange(raw, `Antall for ${duration}`, {
            min: 1,
            max: MAX_PACKING_QUANTITY,
          })
    // The same number as the plain quantity says nothing extra.
    columns[DURATION_QUANTITY_FIELD[duration]] = count === base ? null : count
  }
  return columns
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
    personId: optionalPersonId(input.personId),
  })
}

function normalizeBundleItems(items: PackingBundleItemFields[]) {
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
      return {
        id:
          item.id === undefined
            ? undefined
            : assertResourceId(item.id, "ting i pakken"),
        ...normalized,
        ...normalizeQuantityByDuration(
          item.quantityByDuration,
          normalized.quantity
        ),
        sortOrder: index,
      }
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

/** `undefined` leaves the sub-list alone, `null` takes the item out of it. */
function optionalGroupId(value: string | null | undefined) {
  return value == null ? value : assertResourceId(value, GROUP)
}

/** Every sub-list must be on the list; unknown ids are NOT_FOUND. */
async function assertGroupsOnList(
  tx: Tx,
  listId: string,
  groupIds: Array<string | null | undefined>
) {
  const ids = [
    ...new Set(groupIds.filter((id): id is string => typeof id === "string")),
  ]
  if (ids.length === 0) return
  const found = await tx.packingListGroup.count({
    where: { id: { in: ids }, listId },
  })
  if (found !== ids.length) throw notFound(GROUP)
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
  bundleItemId?: string | null
  personId: string | null
  groupId?: string | null
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

/**
 * Who a bundle's things are for: the person asked for, `null` for shared, or
 * with `undefined` the bundle's own person ("Astrids toalettsaker" → Astrid).
 */
function placementPerson(
  bundle: { personId: string | null },
  requested: string | null | undefined
) {
  return requested === undefined ? bundle.personId : requested
}

/** The bundles' things, with the quantity for the trip's length. */
function bundleEntries(
  placements: BundlePlacement[],
  duration: PackingDuration | null
): NewListItem[] {
  return placements.flatMap(({ bundle, personId }) =>
    bundle.items.map((item) => ({
      name: item.name,
      quantity: quantityForTrip(item, duration),
      notes: item.notes,
      bundleId: bundle.id,
      bundleItemId: item.id,
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

/**
 * Records that the bundles are on the list, and for whom. The template sync
 * finds a template's bundles here, not through its items, so a bundle that is
 * empty for a while keeps its templates.
 */
async function recordPlacements(
  tx: Tx,
  listId: string,
  placements: Array<{ bundleId: string; personId: string | null }>
) {
  if (placements.length === 0) return
  const existing = await tx.packingListBundle.findMany({
    where: { listId },
    select: { bundleId: true, personId: true },
  })
  const key = (entry: { bundleId: string; personId: string | null }) =>
    `${entry.bundleId}\u0000${entry.personId ?? ""}`
  const known = new Set(existing.map(key))
  const fresh: typeof placements = []
  for (const placement of placements) {
    if (known.has(key(placement))) continue
    known.add(key(placement))
    fresh.push(placement)
  }
  if (fresh.length > 0) {
    await tx.packingListBundle.createMany({
      data: fresh.map((placement) => ({ ...placement, listId })),
    })
  }
}

function placementRows(placements: BundlePlacement[]) {
  return placements.map(({ bundle, personId }) => ({
    bundleId: bundle.id,
    personId,
  }))
}

export type BundleRequest = {
  bundleId: string
  /**
   * Copy the bundle for this person, or `null` for shared things. Omit to use
   * the bundle's own person, if it has one.
   */
  personId?: string | null
}

function normalizeBundleRequests(requests: BundleRequest[]) {
  if (!Array.isArray(requests)) {
    throw validationError("Pakkene må være en liste.")
  }
  return requests.map((request) => ({
    bundleId: assertResourceId(request?.bundleId, BUNDLE),
    personId: optionalPersonId(request.personId),
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

/** A sub-list to create with the list, and the things in it. */
export type PackingGroupInput = {
  name: string
  items?: Omit<PackingListItemFields, "groupId">[]
}

export type CreatePackingListInput = PackingListFields & {
  /**
   * Bundles to add, in order: for the bundle's own person if it has one,
   * otherwise as shared things.
   */
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
  /** Sub-lists with their things, added last. */
  groups?: PackingGroupInput[]
}

function normalizeGroupInputs(groups: PackingGroupInput[]) {
  if (!Array.isArray(groups)) {
    throw validationError("Underlistene må være en liste.")
  }
  const seen = new Set<string>()
  return groups.map((group, index) =>
    inBatch(index, "Underliste", () => {
      const name = requiredText(group.name, "Navn")
      const key = packingItemKey(name)
      if (seen.has(key)) {
        throw validationError(`«${name}» står to ganger.`)
      }
      seen.add(key)
      return {
        name,
        items: (group.items ?? []).map((item, itemIndex) =>
          inBatch(itemIndex, "Ting", () => ({
            ...normalizeListItem({ ...item, groupId: null }),
          }))
        ),
      }
    })
  )
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
      personId: undefined,
    })),
    ...normalizeBundleRequests(input.bundles ?? []),
  ]
  if (requests.length > MAX_BATCH_SIZE) {
    throw validationError(`Maks ${MAX_BATCH_SIZE} pakker per kall.`)
  }
  const items = (input.items ?? []).map((item, index) =>
    inBatch(index, "Ting", () => normalizeListItem({ ...item, groupId: null }))
  )
  const groups = normalizeGroupInputs(input.groups ?? [])
  const looseCount =
    items.length + groups.reduce((sum, group) => sum + group.items.length, 0)
  if (looseCount > MAX_PACKING_ITEMS) {
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
      ...groups.flatMap((group) => group.items.map((item) => item.personId)),
    ])
    const bundleIds = requests.map((request) => request.bundleId)
    const chosen = (await loadBundles(tx, context, bundleIds)).map(
      (bundle, index) => ({
        bundle,
        personId: placementPerson(bundle, requests[index]!.personId),
      })
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
          .map((bundle) => ({ bundle, personId: bundle.personId }))
      : []
    const placements = [...chosen, ...automatic]

    const groupEntries: NewListItem[] = []
    for (const [index, group] of groups.entries()) {
      const created = await tx.packingListGroup.create({
        data: { listId: list.id, name: group.name, sortOrder: index },
        select: { id: true },
      })
      for (const item of group.items) {
        groupEntries.push({ ...item, bundleId: null, groupId: created.id })
      }
    }

    const appended = await appendItems(tx, list.id, [
      ...bundleEntries(placements, list.duration),
      ...items.map((item) => ({ ...item, bundleId: null })),
      ...groupEntries,
    ])
    await recordPlacements(tx, list.id, placementRows(placements))

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

/**
 * After the trip's length changed: the bundle things that still have the
 * number the old length gave get the number for the new one. A number
 * changed by hand, or a thing already packed, stays as it is.
 */
async function requantifyItems(
  tx: Tx,
  items: Array<{
    id: string
    quantity: number
    packed: boolean
    bundleItem: DurationQuantities | null
  }>,
  from: PackingDuration | null,
  to: PackingDuration | null
) {
  let changed = 0
  for (const item of items) {
    if (!item.bundleItem || item.packed) continue
    if (item.quantity !== quantityForTrip(item.bundleItem, from)) continue
    const quantity = quantityForTrip(item.bundleItem, to)
    if (quantity === item.quantity) continue
    await tx.packingItem.update({
      where: { id: item.id },
      data: { quantity },
      select: { id: true },
    })
    changed += 1
  }
  return changed
}

const REQUANTIFY_ITEM_SELECT = {
  id: true,
  quantity: true,
  packed: true,
  bundleItem: {
    select: {
      quantity: true,
      quantityDay: true,
      quantityWeekend: true,
      quantityWeek: true,
      quantityLong: true,
    },
  },
} satisfies Prisma.PackingItemSelect

/**
 * Changes the list's fields. A new trip length also updates the quantities
 * of the bundle things that follow the bundle (see `requantifyItems`).
 */
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
      db.$transaction(async (tx) => {
        const before = await tx.packingList.findFirst({
          where: scope,
          select: { duration: true },
        })
        const list = await tx.packingList.update({
          where: { ...scope, ...freshness(expectedUpdatedAt) },
          data: fields,
          select: { id: true, duration: true },
        })
        if (
          before &&
          fields.duration !== undefined &&
          before.duration !== list.duration
        ) {
          const items = await tx.packingItem.findMany({
            where: { listId, bundleItemId: { not: null } },
            select: REQUANTIFY_ITEM_SELECT,
          })
          await requantifyItems(tx, items, before.duration, list.duration)
        }
        return list
      }, BATCH_TRANSACTION_OPTIONS),
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

export type DuplicatePackingListInput = {
  /** Defaults to the source's name, with "(kopi)" when the kind is the same. */
  name?: string
  /**
   * TEMPLATE, TRIP or ARCHIVED. Defaults to the source's kind, and to TRIP
   * when copying a finished trip.
   */
  kind?: PackingListKind
  departureOn?: Date | string | null
  /** The new trip's details; omitted fields are copied from the source. */
  season?: PackingSeason | null
  duration?: PackingDuration | null
  abroad?: boolean
}

/**
 * Copies a list with its sub-lists and items, nothing packed: a template as
 * the start of a trip, a trip saved as a template, or last summer's cabin
 * trip as the start of this summer's. A different trip length gives the bundle
 * things the number for the new length.
 */
export async function duplicatePackingList(
  context: ApplicationContext,
  listId: string,
  input: DuplicatePackingListInput = {}
): Promise<PackingListDetail> {
  assertResourceId(listId, LIST)
  const name =
    input.name === undefined ? undefined : requiredText(input.name, "Navn")
  const departureOn = optionalCalendarDate(input.departureOn, "Avreise")
  const kind =
    input.kind === undefined
      ? undefined
      : enumValue(input.kind, KIND_VALUES, "Type")
  const season = optionalEnum(input.season, SEASON_VALUES, "Sesong")
  const duration = optionalEnum(input.duration, DURATION_VALUES, "Varighet")
  const abroad = optionalBoolean(input.abroad, "Utenlands")

  const copyId = await db.$transaction(async (tx) => {
    const source = await tx.packingList.findFirst({
      where: { id: listId, householdId: context.householdId },
      include: {
        groups: { orderBy: packingGroupOrder },
        bundles: { select: { bundleId: true, personId: true } },
        items: {
          orderBy: packingItemOrder,
          include: {
            bundleItem: { select: REQUANTIFY_ITEM_SELECT.bundleItem.select },
          },
        },
      },
    })
    if (!source) throw notFound(LIST)

    const copyKind = kind ?? (source.kind === "ARCHIVED" ? "TRIP" : source.kind)
    const copyDuration = duration === undefined ? source.duration : duration
    const copy = await tx.packingList.create({
      data: {
        householdId: context.householdId,
        name:
          name ??
          (copyKind === source.kind ? `${source.name} (kopi)` : source.name),
        kind: copyKind,
        season: season === undefined ? source.season : season,
        duration: copyDuration,
        abroad: abroad ?? source.abroad,
        departureOn: departureOn === undefined ? null : departureOn,
        notes: source.notes,
      },
      select: { id: true },
    })

    const groupIds = new Map<string, string>()
    for (const group of source.groups) {
      const created = await tx.packingListGroup.create({
        data: { listId: copy.id, name: group.name, sortOrder: group.sortOrder },
        select: { id: true },
      })
      groupIds.set(group.id, created.id)
    }

    await tx.packingItem.createMany({
      data: source.items.map((item, index) => {
        // Follow the new length unless the number was changed by hand.
        const followsBundle =
          item.bundleItem !== null &&
          item.quantity === quantityForTrip(item.bundleItem, source.duration)
        return {
          listId: copy.id,
          name: item.name,
          quantity:
            followsBundle && item.bundleItem
              ? quantityForTrip(item.bundleItem, copyDuration)
              : item.quantity,
          notes: item.notes,
          bundleId: item.bundleId,
          bundleItemId: item.bundleItemId,
          personId: item.personId,
          groupId: item.groupId ? (groupIds.get(item.groupId) ?? null) : null,
          sortOrder: index,
        }
      }),
    })
    await recordPlacements(tx, copy.id, source.bundles)
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
    await assertGroupsOnList(
      tx,
      list.id,
      normalized.map((item) => item.groupId)
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
  const groupId = optionalGroupId(input.groupId)
  const data = definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    quantity: quantity(input.quantity),
    notes: optionalText(input.notes, "Notat"),
    packed: optionalBoolean(input.packed, "Pakket"),
    personId,
    groupId,
  })
  const scope = { id: itemId, list: { householdId: context.householdId } }

  return scopedWrite({
    resource: ITEM,
    expectedUpdatedAt: input.expectedUpdatedAt,
    write: () =>
      db.$transaction(async (tx) => {
        await assertPersonsInHousehold(tx, context, [personId])
        if (groupId) {
          // The sub-list must be on the item's own list.
          const onSameList = await tx.packingListGroup.count({
            where: {
              id: groupId,
              list: {
                householdId: context.householdId,
                items: { some: { id: itemId } },
              },
            },
          })
          if (onSameList === 0) throw notFound(GROUP)
        }
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
 * Copies the bundles' items into the list, with the quantities for the trip's
 * length, skipping what that person already has on the list. The things go to
 * `personId`, to nobody with `null`, or with `undefined` to each bundle's own
 * person (shared when it has none).
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
  const personId = optionalPersonId(options.personId)

  const result = await db.$transaction(async (tx) => {
    const list = await tx.packingList.findFirst({
      where: { id: listId, householdId: context.householdId },
      select: { id: true, duration: true },
    })
    if (!list) throw notFound(LIST)

    await assertPersonsInHousehold(tx, context, [personId])
    const placements = (await loadBundles(tx, context, ids)).map((bundle) => ({
      bundle,
      personId: placementPerson(bundle, personId),
    }))
    const appended = await appendItems(
      tx,
      list.id,
      bundleEntries(placements, list.duration)
    )
    await recordPlacements(tx, list.id, placementRows(placements))
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
    // The bundle is off the list (packed things may stay as loose things).
    await tx.packingListBundle.deleteMany({
      where: {
        listId,
        bundleId,
        ...(personId !== undefined ? { personId } : {}),
      },
    })
    return result.count
  })

  return { deletedCount: deleted, list: await reloadList(context, listId) }
}

// ─── Bundles ────────────────────────────────────────────────────

export type CreatePackingBundleInput = PackingBundleFields & {
  items?: PackingBundleItemFields[]
}

export async function createPackingBundle(
  context: ApplicationContext,
  input: CreatePackingBundleInput
): Promise<PackingBundleWithItems> {
  const fields = normalizeBundleFields(input)
  const items = normalizeBundleItems(input.items ?? []).map(withoutId)
  const name = requiredText(input.name, "Navn")
  await assertBundleNameFree(context, name)

  try {
    return await db.$transaction(async (tx) => {
      await assertPersonsInHousehold(tx, context, [fields.personId])
      return tx.packingBundle.create({
        data: {
          ...fields,
          name,
          householdId: context.householdId,
          items: { create: items },
        },
        include: packingBundleInclude,
      })
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
   * Omit to leave the items alone. A thing matches the one it replaces by
   * `id`, or else by name, so the lists it is on keep following it.
   */
  items?: PackingBundleItemFields[]
  expectedUpdatedAt?: Date
}

type NormalizedBundleItem = ReturnType<typeof normalizeBundleItems>[number]

/** The columns to write: the id only says which row a thing replaces. */
function withoutId(item: NormalizedBundleItem) {
  const { id, ...columns } = item
  void id
  return columns
}

/**
 * Writes the bundle's new set of things in place: matched things are
 * updated, so the list items copied from them keep their link; the rest are
 * created or removed.
 */
async function replaceBundleItems(
  tx: Tx,
  bundleId: string,
  items: NormalizedBundleItem[]
) {
  const existing = await tx.packingBundleItem.findMany({
    where: { bundleId },
    select: { id: true, name: true },
  })
  const unmatched = new Map(existing.map((item) => [item.id, item]))
  const byName = new Map(
    existing.map((item) => [packingItemKey(item.name), item.id])
  )

  // First pass: explicit ids, so a rename does not lose its row to a name.
  const targets = items.map((item) => {
    if (item.id && unmatched.has(item.id)) {
      unmatched.delete(item.id)
      return item.id
    }
    return undefined
  })
  for (const [index, item] of items.entries()) {
    if (targets[index]) continue
    const id = byName.get(packingItemKey(item.name))
    if (id && unmatched.has(id)) {
      unmatched.delete(id)
      targets[index] = id
    }
  }

  if (unmatched.size > 0) {
    await tx.packingBundleItem.deleteMany({
      where: { bundleId, id: { in: [...unmatched.keys()] } },
    })
  }
  for (const [index, entry] of items.entries()) {
    const item = withoutId(entry)
    const target = targets[index]
    if (target) {
      await tx.packingBundleItem.update({
        where: { id: target, bundleId },
        data: item,
        select: { id: true },
      })
    } else {
      await tx.packingBundleItem.create({
        data: { ...item, bundleId },
        select: { id: true },
      })
    }
  }
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
        db.$transaction(async (tx) => {
          await assertPersonsInHousehold(tx, context, [fields.personId])
          // The scoped update comes first: it is the household boundary for
          // the items written after it.
          await tx.packingBundle.update({
            where: { ...scope, ...freshness(expectedUpdatedAt) },
            data: { ...fields, ...(items ? { updatedAt: new Date() } : {}) },
            select: { id: true },
          })
          if (items) await replaceBundleItems(tx, bundleId, items)
          return tx.packingBundle.findUniqueOrThrow({
            where: { id: bundleId },
            include: packingBundleInclude,
          })
        }, BATCH_TRANSACTION_OPTIONS),
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

// ─── Templates follow their bundles ─────────────────────────────

export type TemplateSyncChange = {
  listId: string
  name: string
  added: number
  updated: number
  removed: number
}

export type TemplateSyncResult = {
  bundle: { id: string; name: string }
  lists: TemplateSyncChange[]
  /** True when nothing was saved and this is only a preview. */
  dryRun: boolean
}

/** Thrown inside the transaction to roll a preview back. */
class DryRunRollback extends Error {
  constructor(readonly result: TemplateSyncResult) {
    super("dry run")
  }
}

/**
 * Brings the templates that use a bundle up to date with it: things added to
 * the bundle are added, changed names, notes and numbers (for the template's
 * trip length) are copied, and things taken out of the bundle are removed.
 * Each person's copy of the bundle is updated on its own. Only templates are
 * touched; trips and finished trips keep what they were packed with.
 *
 * With `listIds` only those templates are updated. With `dryRun` the change
 * is computed and rolled back, so the caller can show what would happen.
 */
export async function syncBundleToTemplates(
  context: ApplicationContext,
  bundleId: string,
  options: { listIds?: string[]; dryRun?: boolean } = {}
): Promise<TemplateSyncResult> {
  assertResourceId(bundleId, BUNDLE)
  const listIds =
    options.listIds === undefined
      ? undefined
      : assertResourceIds(options.listIds, LIST)
  if (listIds) assertBatchSize(listIds.length, "Maler")
  const dryRun = optionalBoolean(options.dryRun, "Forhåndsvisning") ?? false

  try {
    return await db.$transaction(async (tx) => {
      const bundle = await tx.packingBundle.findFirst({
        where: { id: bundleId, householdId: context.householdId },
        include: packingBundleInclude,
      })
      if (!bundle) throw notFound(BUNDLE)

      const templates = await tx.packingList.findMany({
        where: {
          householdId: context.householdId,
          kind: "TEMPLATE",
          OR: [
            { bundles: { some: { bundleId } } },
            // A copy whose placement row was lost still counts.
            { items: { some: { bundleId } } },
          ],
          ...(listIds ? { id: { in: listIds } } : {}),
        },
        select: {
          id: true,
          name: true,
          duration: true,
          bundles: { where: { bundleId }, select: { personId: true } },
          items: {
            where: { bundleId },
            orderBy: packingItemOrder,
            select: {
              id: true,
              name: true,
              quantity: true,
              notes: true,
              personId: true,
              bundleItemId: true,
            },
          },
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      })
      if (listIds && templates.length !== listIds.length) {
        throw validationError(
          "En av listene er ikke en mal som bruker denne pakken."
        )
      }

      const lists: TemplateSyncChange[] = []
      for (const template of templates) {
        lists.push(await syncTemplate(tx, template, bundle))
      }
      const result = {
        bundle: { id: bundle.id, name: bundle.name },
        lists,
        dryRun,
      }
      if (dryRun) throw new DryRunRollback(result)
      return result
    }, BATCH_TRANSACTION_OPTIONS)
  } catch (error) {
    if (error instanceof DryRunRollback) return error.result
    throw error
  }
}

async function syncTemplate(
  tx: Tx,
  template: {
    id: string
    name: string
    duration: PackingDuration | null
    /** Who the bundle is on the list for, from its placements. */
    bundles: Array<{ personId: string | null }>
    items: Array<{
      id: string
      name: string
      quantity: number
      notes: string | null
      personId: string | null
      bundleItemId: string | null
    }>
  },
  bundle: PackingBundleWithItems
): Promise<TemplateSyncChange> {
  const change = {
    listId: template.id,
    name: template.name,
    added: 0,
    updated: 0,
    removed: 0,
  }
  const toRemove: string[] = []
  const missing: NewListItem[] = []

  // Each person's copy of the bundle on its own: Ola's and Kari's. A copy
  // with no things left (the bundle was emptied) is filled again.
  const copies = new Map<string | null, typeof template.items>()
  for (const placement of template.bundles) {
    if (!copies.has(placement.personId)) copies.set(placement.personId, [])
  }
  for (const item of template.items) {
    const copy = copies.get(item.personId) ?? []
    copy.push(item)
    copies.set(item.personId, copy)
  }

  for (const [personId, items] of copies) {
    const matched = new Set<string>()
    const byId = new Map(bundle.items.map((item) => [item.id, item]))
    const pairs: Array<
      [(typeof items)[number], (typeof bundle.items)[number]]
    > = []
    const rest: typeof items = []
    for (const item of items) {
      const source = item.bundleItemId ? byId.get(item.bundleItemId) : undefined
      if (source && !matched.has(source.id)) {
        matched.add(source.id)
        pairs.push([item, source])
      } else {
        rest.push(item)
      }
    }
    // Items copied before the link existed, or whose link was lost: by name.
    for (const item of rest) {
      const source = bundle.items.find(
        (candidate) =>
          !matched.has(candidate.id) &&
          packingItemKey(candidate.name) === packingItemKey(item.name)
      )
      if (source) {
        matched.add(source.id)
        pairs.push([item, source])
      } else {
        toRemove.push(item.id)
      }
    }

    for (const [item, source] of pairs) {
      const next = {
        name: source.name,
        notes: source.notes,
        quantity: quantityForTrip(source, template.duration),
        bundleItemId: source.id,
      }
      const differs =
        item.name !== next.name ||
        item.notes !== next.notes ||
        item.quantity !== next.quantity
      if (differs || item.bundleItemId !== next.bundleItemId) {
        await tx.packingItem.update({
          where: { id: item.id },
          data: next,
          select: { id: true },
        })
        if (differs) change.updated += 1
      }
    }

    for (const source of bundle.items) {
      if (matched.has(source.id)) continue
      missing.push({
        name: source.name,
        quantity: quantityForTrip(source, template.duration),
        notes: source.notes,
        bundleId: bundle.id,
        bundleItemId: source.id,
        personId,
      })
    }
  }

  await recordPlacements(
    tx,
    template.id,
    [...copies.keys()].map((personId) => ({ bundleId: bundle.id, personId }))
  )
  if (toRemove.length > 0) {
    const removed = await tx.packingItem.deleteMany({
      where: { id: { in: toRemove }, listId: template.id },
    })
    change.removed = removed.count
  }
  if (missing.length > 0) {
    const appended = await appendItems(tx, template.id, missing)
    change.added = appended.createdIds.length
  }
  return change
}

// ─── Sub-lists ──────────────────────────────────────────────────

const GROUP_SELECT = {
  id: true,
  listId: true,
  name: true,
  sortOrder: true,
  updatedAt: true,
} as const

async function assertGroupNameFree(
  tx: Tx,
  listId: string,
  name: string,
  exceptId?: string
) {
  const taken = await tx.packingListGroup.count({
    where: {
      listId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  })
  if (taken > 0) {
    throw new ApplicationError(
      "CONFLICT",
      "Listen har allerede en underliste med det navnet."
    )
  }
}

/**
 * Adds a sub-list to a packing list ("Til bilen", "Kjøpe før avreise"), with
 * the things in it: things for this trip that belong together without being
 * a reusable bundle.
 */
export async function createPackingGroup(
  context: ApplicationContext,
  listId: string,
  input: PackingGroupInput
): Promise<PackingChangeResult & { groupId: string }> {
  assertResourceId(listId, LIST)
  const [group] = normalizeGroupInputs([input])
  if (group!.items.length > MAX_BATCH_SIZE) {
    throw validationError(`Maks ${MAX_BATCH_SIZE} ting per kall.`)
  }

  const result = await db.$transaction(async (tx) => {
    const list = await tx.packingList.findFirst({
      where: { id: listId, householdId: context.householdId },
      select: { id: true, groups: { select: { sortOrder: true } } },
    })
    if (!list) throw notFound(LIST)
    await assertGroupNameFree(tx, list.id, group!.name)
    await assertPersonsInHousehold(
      tx,
      context,
      group!.items.map((item) => item.personId)
    )

    const created = await tx.packingListGroup.create({
      data: {
        listId: list.id,
        name: group!.name,
        sortOrder:
          list.groups.reduce(
            (max, entry) => Math.max(max, entry.sortOrder),
            -1
          ) + 1,
      },
      select: { id: true },
    })
    const appended = await appendItems(
      tx,
      list.id,
      group!.items.map((item) => ({
        ...item,
        bundleId: null,
        groupId: created.id,
      }))
    )
    return { groupId: created.id, ...appended }
  }, BATCH_TRANSACTION_OPTIONS)

  return {
    groupId: result.groupId,
    list: await reloadList(context, listId),
    addedBundles: [],
    createdItemIds: result.createdIds,
    skipped: result.skipped,
  }
}

export async function updatePackingGroup(
  context: ApplicationContext,
  groupId: string,
  input: { name: string; expectedUpdatedAt?: Date }
) {
  assertResourceId(groupId, GROUP)
  const name = requiredText(input.name, "Navn")
  const scope = { id: groupId, list: { householdId: context.householdId } }

  return scopedWrite({
    resource: GROUP,
    expectedUpdatedAt: input.expectedUpdatedAt,
    write: () =>
      db.$transaction(async (tx) => {
        const group = await tx.packingListGroup.update({
          where: { ...scope, ...freshness(input.expectedUpdatedAt) },
          data: { name },
          select: GROUP_SELECT,
        })
        await assertGroupNameFree(tx, group.listId, name, group.id)
        return group
      }),
    existsInScope: async () =>
      (await db.packingListGroup.count({ where: scope })) > 0,
  })
}

/**
 * Deletes a sub-list and the things in it, or with `keepItems` only the
 * sub-list, so its things stay on the list without one.
 */
export async function deletePackingGroup(
  context: ApplicationContext,
  groupId: string,
  { keepItems = false }: { keepItems?: boolean } = {}
) {
  assertResourceId(groupId, GROUP)
  const keep = optionalBoolean(keepItems, "Behold tingene") ?? false

  const scope = { id: groupId, list: { householdId: context.householdId } }

  return scopedWrite({
    resource: GROUP,
    write: () =>
      db.$transaction(async (tx) => {
        const deletedItems = keep
          ? 0
          : (
              await tx.packingItem.deleteMany({
                where: { groupId, group: { is: scope } },
              })
            ).count
        const group = await tx.packingListGroup.delete({
          where: scope,
          select: { id: true, name: true, listId: true },
        })
        return { ...group, deletedItemCount: deletedItems }
      }),
  })
}
