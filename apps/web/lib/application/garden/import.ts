import {
  db,
  type Lifecycle,
  type PlantType,
  type Prisma,
  type SunNeed,
  type WateringMethod,
  type WateringNeed,
} from "@workspace/db"

import type { ApplicationContext } from "../context"
import { assertBatchSize, lenientUrl } from "../mutations"
import { findOrCreateBedsByName } from "./write"

/**
 * The LLM import flows take pasted model output. Parsing stays lenient as it
 * always has (ADR 0004): an unknown enum value or a bad URL is dropped rather
 * than failing an import of fifty plants. Every write is still scoped to the
 * caller's household.
 */
export interface BulkPlantInput {
  name: string
  species?: string
  /** Names of the beds the plant grows in. Missing beds are created. */
  beds?: string[]
  /** Older import format: a single bed name. Merged into `beds`. */
  location?: string
  description?: string
  careInstructions?: string
  wateringNeed?: string
  wateringMethod?: string
  sunNeed?: string
  pruningSeason?: string
  isToxic?: boolean
  toxicityNotes?: string
  plantType?: string
  soilType?: string
  fertilizer?: string
  hardinessZone?: string
  lifecycle?: string
  bloomTime?: string
  pests?: string
  notes?: string
  imageUrl?: string
  sourceUrl?: string
}

export interface PlantFieldUpdate {
  id: string
  fields: Omit<Partial<BulkPlantInput>, "name" | "beds" | "location">
  /** Beds to add the plant to. Existing placements are kept. */
  addBeds?: string[]
}

export interface ExistingPlant {
  id: string
  name: string
  species: string | null
  beds: string[]
  description: string | null
  careInstructions: string | null
  wateringNeed: string | null
  wateringMethod: string | null
  sunNeed: string | null
  pruningSeason: string | null
  isToxic: boolean
  toxicityNotes: string | null
  plantType: string | null
  soilType: string | null
  fertilizer: string | null
  hardinessZone: string | null
  lifecycle: string | null
  bloomTime: string | null
  pests: string | null
  notes: string | null
  imageUrl: string | null
  sourceUrl: string | null
}

const validWateringNeed = new Set<WateringNeed>(["LOW", "MEDIUM", "HIGH"])
const validWateringMethod = new Set<WateringMethod>(["MANUAL", "AUTOMATIC"])
const validSunNeed = new Set<SunNeed>(["FULL_SUN", "PARTIAL_SHADE", "SHADE"])
const validPlantType = new Set<PlantType>([
  "TREE",
  "SHRUB",
  "PERENNIAL",
  "ANNUAL",
  "FLOWER",
  "HERB",
  "VEGETABLE",
  "CLIMBER",
  "GRASS",
  "OTHER",
])
const validLifecycle = new Set<Lifecycle>(["ANNUAL", "BIENNIAL", "PERENNIAL"])

function coerceEnum<T extends string>(
  value: string | undefined,
  valid: Set<T>
): T | undefined {
  if (!value) return undefined
  const upper = value.toUpperCase() as T
  return valid.has(upper) ? upper : undefined
}

/** `beds` plus the legacy `location`, trimmed, without blanks. */
export function importedBedNames(
  plant: Pick<BulkPlantInput, "beds" | "location">
) {
  const names = [...(Array.isArray(plant.beds) ? plant.beds : [])]
  if (plant.location) names.push(plant.location)
  return names
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.trim())
    .filter(Boolean)
}

type PlantColumns = Omit<
  Prisma.PlantUncheckedCreateInput,
  "id" | "householdId" | "placements"
>

function plantColumns(
  plant: Omit<Partial<BulkPlantInput>, "beds" | "location">
): Partial<PlantColumns> {
  const columns: Partial<PlantColumns> = {}
  const text = (key: keyof PlantColumns, value: string | undefined) => {
    if (value !== undefined) {
      ;(columns as Record<string, unknown>)[key] = value || null
    }
  }

  text("species", plant.species)
  text("description", plant.description)
  text("careInstructions", plant.careInstructions)
  text("pruningSeason", plant.pruningSeason)
  text("toxicityNotes", plant.toxicityNotes)
  text("soilType", plant.soilType)
  text("fertilizer", plant.fertilizer)
  text("hardinessZone", plant.hardinessZone)
  text("bloomTime", plant.bloomTime)
  text("pests", plant.pests)
  text("notes", plant.notes)

  if (plant.wateringNeed !== undefined)
    columns.wateringNeed = coerceEnum(plant.wateringNeed, validWateringNeed)
  if (plant.wateringMethod !== undefined)
    columns.wateringMethod = coerceEnum(
      plant.wateringMethod,
      validWateringMethod
    )
  if (plant.sunNeed !== undefined)
    columns.sunNeed = coerceEnum(plant.sunNeed, validSunNeed)
  if (plant.plantType !== undefined)
    columns.plantType = coerceEnum(plant.plantType, validPlantType)
  if (plant.lifecycle !== undefined)
    columns.lifecycle = coerceEnum(plant.lifecycle, validLifecycle)
  if (plant.isToxic !== undefined) columns.isToxic = plant.isToxic === true
  if (plant.imageUrl !== undefined)
    columns.imageUrl = lenientUrl(plant.imageUrl) ?? null
  if (plant.sourceUrl !== undefined)
    columns.sourceUrl = lenientUrl(plant.sourceUrl) ?? null

  return columns
}

/**
 * Creates the plants, and the beds they name, inside `tx`. Shared by the
 * merge import here and the full replace in the server actions, so both read
 * the import format the same way.
 */
export async function createImportedPlants(
  tx: Prisma.TransactionClient,
  householdId: string,
  plants: BulkPlantInput[]
) {
  const beds = await findOrCreateBedsByName(
    tx,
    householdId,
    plants.flatMap(importedBedNames)
  )

  for (const plant of plants) {
    const bedIds = new Set(
      importedBedNames(plant)
        .map((name) => beds.get(name.toLowerCase()))
        .filter((id): id is string => Boolean(id))
    )

    await tx.plant.create({
      data: {
        ...plantColumns(plant),
        isToxic: plant.isToxic === true,
        name: plant.name.trim(),
        householdId,
        placements: {
          create: [...bedIds].map((bedId) => ({ bedId })),
        },
      },
    })
  }
}

export async function bulkCreatePlants(
  context: ApplicationContext,
  plants: BulkPlantInput[]
) {
  assertBatchSize(plants.length, "Planter")

  await db.$transaction((tx) =>
    createImportedPlants(tx, context.householdId, plants)
  )

  return { count: plants.length }
}

export async function findExistingPlants(
  context: ApplicationContext,
  names: string[]
): Promise<ExistingPlant[]> {
  const lowerNames = new Set(names.map((name) => name.toLowerCase()))

  const existing = await db.plant.findMany({
    where: { householdId: context.householdId },
    include: {
      placements: {
        select: { bed: { select: { name: true } } },
        orderBy: { bed: { name: "asc" } },
      },
    },
  })

  return existing
    .filter((plant) => lowerNames.has(plant.name.toLowerCase()))
    .map((plant) => ({
      id: plant.id,
      name: plant.name,
      species: plant.species,
      beds: plant.placements.map((placement) => placement.bed.name),
      description: plant.description,
      careInstructions: plant.careInstructions,
      wateringNeed: plant.wateringNeed,
      wateringMethod: plant.wateringMethod,
      sunNeed: plant.sunNeed,
      pruningSeason: plant.pruningSeason,
      isToxic: plant.isToxic,
      toxicityNotes: plant.toxicityNotes,
      plantType: plant.plantType,
      soilType: plant.soilType,
      fertilizer: plant.fertilizer,
      hardinessZone: plant.hardinessZone,
      lifecycle: plant.lifecycle,
      bloomTime: plant.bloomTime,
      pests: plant.pests,
      notes: plant.notes,
      imageUrl: plant.imageUrl,
      sourceUrl: plant.sourceUrl,
    }))
}

/**
 * New plants and field updates of existing ones in one transaction, so a
 * failed update (a plant deleted between preview and import, or an id from
 * another household) leaves nothing half imported.
 */
export async function importPlantsWithDuplicates(
  context: ApplicationContext,
  input: { newPlants: BulkPlantInput[]; updates: PlantFieldUpdate[] }
) {
  assertBatchSize(input.newPlants.length + input.updates.length, "Planter", {
    allowEmpty: true,
  })
  const { householdId } = context

  await db.$transaction(async (tx) => {
    await createImportedPlants(tx, householdId, input.newPlants)

    const beds = await findOrCreateBedsByName(
      tx,
      householdId,
      input.updates.flatMap((update) => update.addBeds ?? [])
    )

    for (const update of input.updates) {
      const bedIds = new Set(
        (update.addBeds ?? [])
          .map((name) => beds.get(name.trim().toLowerCase()))
          .filter((id): id is string => Boolean(id))
      )

      await tx.plant.update({
        where: { id: update.id, householdId },
        data: {
          ...plantColumns(update.fields),
          placements: {
            connectOrCreate: [...bedIds].map((bedId) => ({
              where: { plantId_bedId: { plantId: update.id, bedId } },
              create: { bedId },
            })),
          },
        },
      })
    }
  })

  return { count: input.newPlants.length + input.updates.length }
}
