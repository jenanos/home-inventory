"use server"

import {
  db,
  type Lifecycle,
  type PlantType,
  type SunNeed,
  type WateringMethod,
  type WateringNeed,
} from "@workspace/db"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

function sanitizeUrl(
  url: string | undefined | null
): string | undefined | null {
  if (!url) return url
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return url
    }
  } catch {
    // invalid URL
  }
  return undefined
}

// --- Plant CRUD actions ---

interface CreatePlantInput {
  name: string
  species?: string
  location?: string
  description?: string
  careInstructions?: string
  wateringNeed?: WateringNeed
  wateringMethod?: WateringMethod
  lastWateredAt?: Date
  sunNeed?: SunNeed
  lastPrunedAt?: Date
  pruningSeason?: string
  isToxic?: boolean
  toxicityNotes?: string
  plantType?: PlantType
  soilType?: string
  fertilizer?: string
  hardinessZone?: string
  lifecycle?: Lifecycle
  bloomTime?: string
  plantedAt?: Date
  pests?: string
  notes?: string
  imageUrl?: string
}

export async function createPlant(input: CreatePlantInput) {
  const { membership } = await requireHousehold()

  return db.plant.create({
    data: {
      name: input.name,
      species: input.species,
      location: input.location,
      description: input.description,
      careInstructions: input.careInstructions,
      wateringNeed: input.wateringNeed,
      wateringMethod: input.wateringMethod,
      lastWateredAt: input.lastWateredAt,
      sunNeed: input.sunNeed,
      lastPrunedAt: input.lastPrunedAt,
      pruningSeason: input.pruningSeason,
      isToxic: input.isToxic ?? false,
      toxicityNotes: input.toxicityNotes,
      plantType: input.plantType,
      soilType: input.soilType,
      fertilizer: input.fertilizer,
      hardinessZone: input.hardinessZone,
      lifecycle: input.lifecycle,
      bloomTime: input.bloomTime,
      plantedAt: input.plantedAt,
      pests: input.pests,
      notes: input.notes,
      imageUrl: sanitizeUrl(input.imageUrl) ?? undefined,
      householdId: membership.householdId,
    },
  })
}

interface UpdatePlantInput {
  id: string
  name?: string
  species?: string | null
  location?: string | null
  description?: string | null
  careInstructions?: string | null
  wateringNeed?: WateringNeed | null
  wateringMethod?: WateringMethod | null
  lastWateredAt?: Date | null
  sunNeed?: SunNeed | null
  lastPrunedAt?: Date | null
  pruningSeason?: string | null
  isToxic?: boolean
  toxicityNotes?: string | null
  plantType?: PlantType | null
  soilType?: string | null
  fertilizer?: string | null
  hardinessZone?: string | null
  lifecycle?: Lifecycle | null
  bloomTime?: string | null
  plantedAt?: Date | null
  pests?: string | null
  notes?: string | null
  imageUrl?: string | null
}

export async function updatePlant(input: UpdatePlantInput) {
  const { membership } = await requireHousehold()

  const plant = await db.plant.findUnique({ where: { id: input.id } })
  if (!plant || plant.householdId !== membership.householdId) {
    throw new Error("Plant not found")
  }

  const { id, imageUrl, ...rest } = input
  const updated = await db.plant.update({
    where: { id },
    data: {
      ...rest,
      ...(imageUrl !== undefined && { imageUrl: sanitizeUrl(imageUrl) }),
    },
  })

  revalidatePath("/hage")
  revalidatePath(`/hage/${id}`)
  return updated
}

export async function deletePlant(plantId: string) {
  const { membership } = await requireHousehold()

  const plant = await db.plant.findUnique({ where: { id: plantId } })
  if (!plant || plant.householdId !== membership.householdId) {
    throw new Error("Plant not found")
  }

  await db.plant.delete({ where: { id: plantId } })

  revalidatePath("/hage")
}

// ─── Bulk Import (LLM) ──────────────────────────────────────────

interface BulkPlantInput {
  name: string
  species?: string
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

function toPlantData(plant: BulkPlantInput, householdId: string) {
  return {
    name: plant.name,
    species: plant.species || undefined,
    location: plant.location || undefined,
    description: plant.description || undefined,
    careInstructions: plant.careInstructions || undefined,
    wateringNeed: coerceEnum(plant.wateringNeed, validWateringNeed),
    wateringMethod: coerceEnum(plant.wateringMethod, validWateringMethod),
    sunNeed: coerceEnum(plant.sunNeed, validSunNeed),
    pruningSeason: plant.pruningSeason || undefined,
    isToxic: plant.isToxic ?? false,
    toxicityNotes: plant.toxicityNotes || undefined,
    plantType: coerceEnum(plant.plantType, validPlantType),
    soilType: plant.soilType || undefined,
    fertilizer: plant.fertilizer || undefined,
    hardinessZone: plant.hardinessZone || undefined,
    lifecycle: coerceEnum(plant.lifecycle, validLifecycle),
    bloomTime: plant.bloomTime || undefined,
    pests: plant.pests || undefined,
    notes: plant.notes || undefined,
    householdId,
  }
}

interface BulkPlantImportInput {
  plants: BulkPlantInput[]
}

export async function bulkCreatePlants(input: BulkPlantImportInput) {
  const { membership } = await requireHousehold()

  const results = await db.$transaction(
    input.plants.map((plant) =>
      db.plant.create({
        data: toPlantData(plant, membership.householdId),
      })
    )
  )

  revalidatePath("/hage")
  return { count: results.length }
}

export async function replacePlants(input: BulkPlantImportInput) {
  const { membership } = await requireHousehold()

  await db.$transaction(async (tx) => {
    await tx.plant.deleteMany({
      where: { householdId: membership.householdId },
    })

    for (const plant of input.plants) {
      await tx.plant.create({
        data: toPlantData(plant, membership.householdId),
      })
    }
  })

  revalidatePath("/hage")
  return { count: input.plants.length }
}

// ─── Duplicate Detection ────────────────────────────────────────

export interface ExistingPlant {
  id: string
  name: string
  species: string | null
  location: string | null
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
}

export async function findExistingPlants(
  names: string[]
): Promise<ExistingPlant[]> {
  const { membership } = await requireHousehold()

  const lowerNames = names.map((n) => n.toLowerCase())

  const existing = await db.plant.findMany({
    where: { householdId: membership.householdId },
  })

  return existing
    .filter((plant) => lowerNames.includes(plant.name.toLowerCase()))
    .map((plant) => ({
      id: plant.id,
      name: plant.name,
      species: plant.species,
      location: plant.location,
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
    }))
}

// ─── Bulk Import With Duplicate Handling ────────────────────────

export interface PlantFieldUpdate {
  id: string
  fields: {
    species?: string
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
  }
}

interface BulkPlantImportWithDuplicatesInput {
  newPlants: BulkPlantInput[]
  updates: PlantFieldUpdate[]
}

export async function bulkImportPlantsWithDuplicates(
  input: BulkPlantImportWithDuplicatesInput
) {
  const { membership } = await requireHousehold()

  let count = 0

  if (input.newPlants.length > 0) {
    const results = await db.$transaction(
      input.newPlants.map((plant) =>
        db.plant.create({
          data: toPlantData(plant, membership.householdId),
        })
      )
    )
    count += results.length
  }

  if (input.updates.length > 0) {
    const updateOps = input.updates.map((update) => {
      const f = update.fields
      const data: {
        species?: string
        location?: string
        description?: string
        careInstructions?: string
        wateringNeed?: WateringNeed
        wateringMethod?: WateringMethod
        sunNeed?: SunNeed
        pruningSeason?: string
        isToxic?: boolean
        toxicityNotes?: string
        plantType?: PlantType
        soilType?: string
        fertilizer?: string
        hardinessZone?: string
        lifecycle?: Lifecycle
        bloomTime?: string
        pests?: string
        notes?: string
      } = {}

      if (f.species !== undefined) data.species = f.species || undefined
      if (f.location !== undefined) data.location = f.location || undefined
      if (f.description !== undefined)
        data.description = f.description || undefined
      if (f.careInstructions !== undefined)
        data.careInstructions = f.careInstructions || undefined
      if (f.wateringNeed !== undefined)
        data.wateringNeed = coerceEnum(f.wateringNeed, validWateringNeed)
      if (f.wateringMethod !== undefined)
        data.wateringMethod = coerceEnum(f.wateringMethod, validWateringMethod)
      if (f.sunNeed !== undefined)
        data.sunNeed = coerceEnum(f.sunNeed, validSunNeed)
      if (f.pruningSeason !== undefined)
        data.pruningSeason = f.pruningSeason || undefined
      if (f.isToxic !== undefined) data.isToxic = f.isToxic
      if (f.toxicityNotes !== undefined)
        data.toxicityNotes = f.toxicityNotes || undefined
      if (f.plantType !== undefined)
        data.plantType = coerceEnum(f.plantType, validPlantType)
      if (f.soilType !== undefined) data.soilType = f.soilType || undefined
      if (f.fertilizer !== undefined)
        data.fertilizer = f.fertilizer || undefined
      if (f.hardinessZone !== undefined)
        data.hardinessZone = f.hardinessZone || undefined
      if (f.lifecycle !== undefined)
        data.lifecycle = coerceEnum(f.lifecycle, validLifecycle)
      if (f.bloomTime !== undefined) data.bloomTime = f.bloomTime || undefined
      if (f.pests !== undefined) data.pests = f.pests || undefined
      if (f.notes !== undefined) data.notes = f.notes || undefined

      return db.plant.update({
        where: { id: update.id, householdId: membership.householdId },
        data,
      })
    })

    await db.$transaction(updateOps)
    count += input.updates.length
  }

  revalidatePath("/hage")
  return { count }
}
