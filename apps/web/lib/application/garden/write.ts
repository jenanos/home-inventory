import {
  db,
  Lifecycle,
  type Plant,
  PlantType,
  SunNeed,
  WateringMethod,
  WateringNeed,
} from "@workspace/db"

import type { ApplicationContext } from "../context"
import { ApplicationError } from "../errors"
import {
  MAX_LONG_TEXT_LENGTH,
  assertBatchSize,
  definedFields,
  enumValue,
  freshness,
  notFound,
  optionalCalendarDate,
  optionalText,
  optionalTimestampInput,
  optionalUrl,
  requiredText,
  scopedWrite,
  validationError,
} from "../mutations"

const RESOURCE = "plante"

/** Room for a batch of up to 100 plants on a slow database. */
const BATCH_TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 }

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  location?: string | null
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

export type UpdatePlantInput = Partial<PlantFields> & {
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
    location: optionalText(input.location, "Plassering"),
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

export async function createPlant(
  context: ApplicationContext,
  input: PlantFields
) {
  const fields = normalizePlantFields(input)

  return db.plant.create({
    data: {
      ...fields,
      name: requiredText(input.name, "Navn"),
      householdId: context.householdId,
    },
  })
}

export async function updatePlant(
  context: ApplicationContext,
  plantId: string,
  input: UpdatePlantInput
) {
  const { expectedUpdatedAt, ...rest } = input
  const fields = normalizePlantFields(rest)
  const scope = { id: plantId, householdId: context.householdId }

  return scopedWrite({
    resource: RESOURCE,
    expectedUpdatedAt,
    write: () =>
      db.plant.update({
        where: { ...scope, ...freshness(expectedUpdatedAt) },
        data: fields,
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
        select: { id: true, name: true },
      }),
  })
}

// ─── Batches ────────────────────────────────────────────────────

const plantNameCollator = new Intl.Collator("nb-NO", { sensitivity: "base" })

function sameName(a: string, b: string) {
  return plantNameCollator.compare(a.trim(), b.trim()) === 0
}

export type SkippedPlant = {
  name: string
  /** The plant that already has this name. */
  existingPlantId: string
}

export type AddPlantsResult = {
  created: Plant[]
  skipped: SkippedPlant[]
}

/**
 * Adds up to 100 plants in one transaction, so a whole garden can be laid out
 * in one call. With `onDuplicate: "skip"` a plant whose name is already in the
 * garden, ignoring case, or earlier in the same batch, is reported with the
 * existing plant's id instead of being created. Any invalid plant fails the
 * whole call and nothing is saved.
 */
export async function addPlants(
  context: ApplicationContext,
  plants: PlantFields[],
  { onDuplicate = "skip" }: { onDuplicate?: "skip" | "create" } = {}
): Promise<AddPlantsResult> {
  assertBatchSize(plants.length, "Planter")

  const prepared = plants.map((plant, index) => {
    try {
      return {
        ...normalizePlantFields(plant),
        name: requiredText(plant.name, "Navn"),
      }
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw new ApplicationError(
          error.code,
          `Plante ${index + 1}: ${error.message}`
        )
      }
      throw error
    }
  })

  return db.$transaction(async (tx) => {
    const known =
      onDuplicate === "skip"
        ? await tx.plant.findMany({
            where: { householdId: context.householdId },
            select: { id: true, name: true },
          })
        : []

    const result: AddPlantsResult = { created: [], skipped: [] }

    for (const data of prepared) {
      const existing = known.find((plant) => sameName(plant.name, data.name))
      if (existing) {
        result.skipped.push({ name: data.name, existingPlantId: existing.id })
        continue
      }

      const created = await tx.plant.create({
        data: { ...data, householdId: context.householdId },
      })
      result.created.push(created)
      if (onDuplicate === "skip") known.push(created)
    }

    return result
  }, BATCH_TRANSACTION_OPTIONS)
}

/** How far ahead of the server clock a care time may be. */
const CARE_CLOCK_SKEW_MS = 5 * 60 * 1000

export type RecordPlantCareInput = {
  watered?: boolean
  pruned?: boolean
  /** When it was done. Defaults to now. */
  at?: Date | string
}

/**
 * Records that one or more plants were watered and/or pruned. A plant already
 * recorded at the same time or later keeps its newer value, so repeating the
 * call, or recording an older event, never moves a date backwards. Every id
 * must be a plant in the household, or nothing changes and the call is
 * NOT_FOUND.
 */
export async function recordPlantCare(
  context: ApplicationContext,
  plantIds: string[],
  input: RecordPlantCareInput,
  now: Date = new Date()
): Promise<Plant[]> {
  assertBatchSize(plantIds.length, "Planter")
  const ids = [...new Set(plantIds)]
  if (ids.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    throw notFound(RESOURCE)
  }
  if (input.watered !== true && input.pruned !== true) {
    throw validationError("Oppgi watered, pruned eller begge.")
  }

  const at =
    input.at === undefined
      ? now
      : (optionalTimestampInput(input.at, "Tidspunkt") ?? now)
  if (at.getTime() > now.getTime() + CARE_CLOCK_SKEW_MS) {
    throw validationError("Tidspunkt kan ikke være i fremtiden.")
  }

  const where = { id: { in: ids }, householdId: context.householdId }

  return db.$transaction(async (tx) => {
    const found = await tx.plant.count({ where })
    if (found !== ids.length) throw notFound(RESOURCE)

    if (input.watered) {
      await tx.plant.updateMany({
        where: {
          ...where,
          OR: [{ lastWateredAt: null }, { lastWateredAt: { lt: at } }],
        },
        data: { lastWateredAt: at },
      })
    }
    if (input.pruned) {
      await tx.plant.updateMany({
        where: {
          ...where,
          OR: [{ lastPrunedAt: null }, { lastPrunedAt: { lt: at } }],
        },
        data: { lastPrunedAt: at },
      })
    }

    return tx.plant.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    })
  })
}
