import {
  db,
  Prisma,
  Lifecycle,
  PlantType,
  SunNeed,
  WateringMethod,
  WateringNeed,
} from "@workspace/db"

import { ApplicationError } from "../errors"
import type { ApplicationContext } from "../context"
import {
  MAX_BATCH_SIZE,
  MAX_LONG_TEXT_LENGTH,
  definedFields,
  enumValue,
  freshness,
  integerInRange,
  isUniqueConstraintError,
  optionalCalendarDate,
  optionalText,
  optionalTimestampInput,
  optionalUrl,
  requiredText,
  scopedWrite,
  validationError,
} from "../mutations"
import { plantPlacementsInclude } from "./read"

const RESOURCE = "plante"
const BED_RESOURCE = "bed"

/** Upper bound for a quantity on a placement; more is a typo, not a garden. */
export const MAX_PLACEMENT_QUANTITY = 10_000

const WATERING_NEED_VALUES = Object.values(WateringNeed)
const WATERING_METHOD_VALUES = Object.values(WateringMethod)
const SUN_NEED_VALUES = Object.values(SunNeed)
const PLANT_TYPE_VALUES = Object.values(PlantType)
const LIFECYCLE_VALUES = Object.values(Lifecycle)

/**
 * Every plant field a caller may set. `undefined` leaves a column alone on
 * update; `null` clears it. Dates accept a `Date` from the web flow or a string
 * from MCP: `plantedAt` is a calendar date, the other two are timestamps.
 */
export type PlantFields = {
  name: string
  species?: string | null
  description?: string | null
  careInstructions?: string | null
  wateringNeed?: WateringNeed | null
  wateringMethod?: WateringMethod | null
  lastWateredAt?: Date | string | null
  sunNeed?: SunNeed | null
  lastPrunedAt?: Date | string | null
  pruningSeason?: string | null
  isToxic?: boolean
  toxicityNotes?: string | null
  plantType?: PlantType | null
  soilType?: string | null
  fertilizer?: string | null
  hardinessZone?: string | null
  lifecycle?: Lifecycle | null
  bloomTime?: string | null
  plantedAt?: Date | string | null
  pests?: string | null
  notes?: string | null
  imageUrl?: string | null
  sourceUrl?: string | null
}

/** One bed a plant grows in. */
export type PlacementInput = {
  bedId: string
  quantity?: number | null
  notes?: string | null
}

export type CreatePlantInput = PlantFields & {
  placements?: PlacementInput[]
}

export type UpdatePlantInput = Partial<PlantFields> & {
  /**
   * The complete set of beds the plant grows in. Beds left out are removed
   * from the plant; omit the field to leave placements alone.
   */
  placements?: PlacementInput[]
  /** Rejects the write with CONFLICT if the plant changed since it was read. */
  expectedUpdatedAt?: Date
}

function optionalEnum<T extends string>(
  value: T | null | undefined,
  allowed: readonly T[],
  field: string
): T | null | undefined {
  return value == null ? value : enumValue(value, allowed, field)
}

/**
 * Server actions are public endpoints, so the TypeScript types above are not a
 * guarantee: every value is validated here, for the web flow and MCP alike.
 */
function normalizePlantFields(input: Partial<PlantFields>) {
  if (input.isToxic !== undefined && typeof input.isToxic !== "boolean") {
    throw validationError("Giftig må være sann eller usann.")
  }

  return definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    species: optionalText(input.species, "Art"),
    description: optionalText(
      input.description,
      "Beskrivelse",
      MAX_LONG_TEXT_LENGTH
    ),
    careInstructions: optionalText(
      input.careInstructions,
      "Stellinstruksjoner",
      MAX_LONG_TEXT_LENGTH
    ),
    wateringNeed: optionalEnum(
      input.wateringNeed,
      WATERING_NEED_VALUES,
      "Vannbehov"
    ),
    wateringMethod: optionalEnum(
      input.wateringMethod,
      WATERING_METHOD_VALUES,
      "Vanningsmetode"
    ),
    lastWateredAt: optionalTimestampInput(input.lastWateredAt, "Sist vannet"),
    sunNeed: optionalEnum(input.sunNeed, SUN_NEED_VALUES, "Solbehov"),
    lastPrunedAt: optionalTimestampInput(input.lastPrunedAt, "Sist beskåret"),
    pruningSeason: optionalText(input.pruningSeason, "Beskjæringstid"),
    isToxic: input.isToxic,
    toxicityNotes: optionalText(input.toxicityNotes, "Giftighetsnotat"),
    plantType: optionalEnum(input.plantType, PLANT_TYPE_VALUES, "Plantetype"),
    soilType: optionalText(input.soilType, "Jordtype"),
    fertilizer: optionalText(input.fertilizer, "Gjødsel"),
    hardinessZone: optionalText(input.hardinessZone, "Herdighetssone"),
    lifecycle: optionalEnum(input.lifecycle, LIFECYCLE_VALUES, "Livssyklus"),
    bloomTime: optionalText(input.bloomTime, "Blomstringstid"),
    plantedAt: optionalCalendarDate(input.plantedAt, "Plantet"),
    pests: optionalText(input.pests, "Skadedyr", MAX_LONG_TEXT_LENGTH),
    notes: optionalText(input.notes, "Notater", MAX_LONG_TEXT_LENGTH),
    imageUrl: optionalUrl(input.imageUrl, "Bilde-URL"),
    sourceUrl: optionalUrl(input.sourceUrl, "Kilde-URL"),
  })
}

type NormalizedPlacement = {
  bedId: string
  quantity: number | null | undefined
  notes: string | null | undefined
}

function normalizePlacements(
  placements: PlacementInput[]
): NormalizedPlacement[] {
  if (!Array.isArray(placements)) {
    throw validationError("Plasseringer må være en liste.")
  }
  if (placements.length > MAX_BATCH_SIZE) {
    throw validationError(
      `En plante kan ha maks ${MAX_BATCH_SIZE} plasseringer.`
    )
  }

  const seen = new Set<string>()
  return placements.map((placement) => {
    if (typeof placement?.bedId !== "string" || !placement.bedId) {
      throw validationError("Hver plassering må ha et bed.")
    }
    if (seen.has(placement.bedId)) {
      throw validationError("Samme bed kan bare stå én gang per plante.")
    }
    seen.add(placement.bedId)

    return {
      bedId: placement.bedId,
      quantity:
        placement.quantity == null
          ? placement.quantity
          : integerInRange(placement.quantity, "Antall", {
              min: 1,
              max: MAX_PLACEMENT_QUANTITY,
            }),
      notes: optionalText(placement.notes, "Plasseringsnotat"),
    }
  })
}

/**
 * A placement may only point at a bed in the caller's household. Unknown and
 * foreign bed ids get the same answer (plan 9.4).
 */
async function assertBedsInHousehold(
  context: ApplicationContext,
  placements: NormalizedPlacement[]
) {
  if (placements.length === 0) return

  const bedIds = placements.map((placement) => placement.bedId)
  const found = await db.gardenBed.count({
    where: { id: { in: bedIds }, householdId: context.householdId },
  })

  if (found !== bedIds.length) {
    throw notFoundBed()
  }
}

function notFoundBed() {
  return new ApplicationError("NOT_FOUND", "Fant ingen bed med den ID-en.")
}

/** Prisma raises on a malformed UUID; report it as the caller's mistake. */
function assertUuids(ids: string[], field: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (ids.some((id) => !uuid.test(id))) {
    throw validationError(`${field} må være en gyldig ID.`)
  }
}

export async function createPlant(
  context: ApplicationContext,
  input: CreatePlantInput
) {
  const { placements: rawPlacements, ...rest } = input
  const fields = normalizePlantFields(rest)
  const placements = normalizePlacements(rawPlacements ?? [])
  assertUuids(
    placements.map((placement) => placement.bedId),
    "bedId"
  )
  await assertBedsInHousehold(context, placements)

  return db.plant.create({
    data: {
      ...fields,
      name: requiredText(input.name, "Navn"),
      householdId: context.householdId,
      placements: {
        create: placements.map((placement) => ({
          bedId: placement.bedId,
          quantity: placement.quantity ?? null,
          notes: placement.notes ?? null,
        })),
      },
    },
    include: plantPlacementsInclude,
  })
}

export async function updatePlant(
  context: ApplicationContext,
  plantId: string,
  input: UpdatePlantInput
) {
  const { expectedUpdatedAt, placements: rawPlacements, ...rest } = input
  const fields = normalizePlantFields(rest)
  const placements =
    rawPlacements === undefined ? undefined : normalizePlacements(rawPlacements)
  const scope = { id: plantId, householdId: context.householdId }

  if (placements) {
    assertUuids(
      placements.map((placement) => placement.bedId),
      "bedId"
    )
    await assertBedsInHousehold(context, placements)
  }

  // The placement rows are written through the plant, so the ownership
  // boundary in `where` covers them, and the whole change is one statement.
  const placementWrite: Prisma.PlantUpdateInput["placements"] = placements && {
    deleteMany: {
      bedId: { notIn: placements.map((placement) => placement.bedId) },
    },
    upsert: placements.map((placement) => ({
      where: { plantId_bedId: { plantId, bedId: placement.bedId } },
      create: {
        bedId: placement.bedId,
        quantity: placement.quantity ?? null,
        notes: placement.notes ?? null,
      },
      update: definedFields({
        quantity: placement.quantity,
        notes: placement.notes,
      }),
    })),
  }

  return scopedWrite({
    resource: RESOURCE,
    expectedUpdatedAt,
    write: () =>
      db.plant.update({
        where: { ...scope, ...freshness(expectedUpdatedAt) },
        data: {
          ...fields,
          ...(placementWrite
            ? {
                placements: placementWrite,
                // A placement change is a change to the plant, so the next
                // stale write is caught even when no plant column changed.
                updatedAt: new Date(),
              }
            : {}),
        },
        include: plantPlacementsInclude,
      }),
    existsInScope: async () => (await db.plant.count({ where: scope })) > 0,
  })
}

export async function deletePlant(
  context: ApplicationContext,
  plantId: string
) {
  return scopedWrite({
    resource: RESOURCE,
    write: () =>
      db.plant.delete({
        where: { id: plantId, householdId: context.householdId },
      }),
  })
}

// ─── Beds ───────────────────────────────────────────────────────

export type GardenBedFields = {
  name: string
  description?: string | null
  sunExposure?: SunNeed | null
  notes?: string | null
}

export type UpdateGardenBedInput = Partial<GardenBedFields> & {
  expectedUpdatedAt?: Date
}

function normalizeBedFields(input: Partial<GardenBedFields>) {
  return definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    description: optionalText(
      input.description,
      "Beskrivelse",
      MAX_LONG_TEXT_LENGTH
    ),
    sunExposure: optionalEnum(input.sunExposure, SUN_NEED_VALUES, "Sol"),
    notes: optionalText(input.notes, "Notater", MAX_LONG_TEXT_LENGTH),
  })
}

function duplicateBedName(name: string) {
  return new ApplicationError(
    "CONFLICT",
    `Det finnes allerede et bed som heter «${name}».`
  )
}

/**
 * Bed names are unique per household, ignoring case, so "Staudebed" and
 * "staudebed" cannot become two beds. The database index is exact-case; this
 * check covers the rest, and the index still settles a race.
 */
async function assertBedNameFree(
  context: ApplicationContext,
  name: string,
  exceptBedId?: string
) {
  const existing = await db.gardenBed.findFirst({
    where: {
      householdId: context.householdId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptBedId ? { id: { not: exceptBedId } } : {}),
    },
    select: { id: true },
  })
  if (existing) throw duplicateBedName(name)
}

async function withBedNameConflict<T>(
  name: string | undefined,
  write: () => Promise<T>
) {
  try {
    return await write()
  } catch (error) {
    if (isUniqueConstraintError(error)) throw duplicateBedName(name ?? "")
    throw error
  }
}

export async function createGardenBed(
  context: ApplicationContext,
  input: GardenBedFields
) {
  const fields = normalizeBedFields(input)
  const name = requiredText(input.name, "Navn")
  await assertBedNameFree(context, name)

  return withBedNameConflict(name, () =>
    db.gardenBed.create({
      data: { ...fields, name, householdId: context.householdId },
    })
  )
}

export async function updateGardenBed(
  context: ApplicationContext,
  bedId: string,
  input: UpdateGardenBedInput
) {
  const { expectedUpdatedAt, ...rest } = input
  const fields = normalizeBedFields(rest)
  const scope = { id: bedId, householdId: context.householdId }

  if (fields.name) {
    await assertBedNameFree(context, fields.name, bedId)
  }

  return withBedNameConflict(fields.name, () =>
    scopedWrite({
      resource: BED_RESOURCE,
      expectedUpdatedAt,
      write: () =>
        db.gardenBed.update({
          where: { ...scope, ...freshness(expectedUpdatedAt) },
          data: fields,
        }),
      existsInScope: async () =>
        (await db.gardenBed.count({ where: scope })) > 0,
    })
  )
}

/** Removes the bed and its placements. The plants themselves stay. */
export async function deleteGardenBed(
  context: ApplicationContext,
  bedId: string
) {
  return scopedWrite({
    resource: BED_RESOURCE,
    write: () =>
      db.gardenBed.delete({
        where: { id: bedId, householdId: context.householdId },
      }),
  })
}

/**
 * Resolves bed names to ids for the import flows, creating the beds that do
 * not exist yet. Matching ignores case and surrounding whitespace.
 */
export async function findOrCreateBedsByName(
  tx: Prisma.TransactionClient,
  householdId: string,
  names: Iterable<string>
): Promise<Map<string, string>> {
  const wanted = new Map<string, string>()
  for (const raw of names) {
    const name = raw.trim()
    if (name) wanted.set(name.toLowerCase(), name)
  }

  const result = new Map<string, string>()
  if (wanted.size === 0) return result

  const existing = await tx.gardenBed.findMany({
    where: { householdId },
    select: { id: true, name: true },
  })
  for (const bed of existing) {
    const key = bed.name.toLowerCase()
    if (wanted.has(key)) result.set(key, bed.id)
  }

  for (const [key, name] of wanted) {
    if (result.has(key)) continue
    const bed = await tx.gardenBed.create({
      data: { name: requiredText(name, "Bednavn"), householdId },
      select: { id: true },
    })
    result.set(key, bed.id)
  }

  return result
}
