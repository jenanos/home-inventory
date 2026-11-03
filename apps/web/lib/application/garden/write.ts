import {
  db,
  Lifecycle,
  PlantType,
  SunNeed,
  WateringMethod,
  WateringNeed,
} from "@workspace/db"

import type { ApplicationContext } from "../context"
import {
  MAX_LONG_TEXT_LENGTH,
  definedFields,
  enumValue,
  freshness,
  optionalCalendarDate,
  optionalText,
  optionalTimestampInput,
  optionalUrl,
  requiredText,
  scopedWrite,
  validationError,
} from "../mutations"

const RESOURCE = "plante"

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
      }),
  })
}
