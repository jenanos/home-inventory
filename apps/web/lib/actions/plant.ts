"use server"

import { db } from "@workspace/db"
import {
  bulkCreatePlants as bulkCreatePlantsService,
  createImportedPlants,
  findExistingPlants as findExistingPlantsService,
  importPlantsWithDuplicates,
  type BulkPlantInput,
  type ExistingPlant,
  type PlantFieldUpdate,
} from "@/lib/application/garden/import"
import {
  createGardenBed as createGardenBedService,
  createPlant as createPlantService,
  deleteGardenBed as deleteGardenBedService,
  deletePlant as deletePlantService,
  updateGardenBed as updateGardenBedService,
  updatePlant as updatePlantService,
  type CreatePlantInput,
  type GardenBedFields,
  type UpdateGardenBedInput,
  type UpdatePlantInput,
} from "@/lib/application/garden/write"
import { assertBatchSize } from "@/lib/application/mutations"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

// --- Plant and bed actions ---
//
// Thin adapters: the browser context comes from the session, the rules and the
// ownership boundary live in the garden services shared with MCP.

function revalidateGarden() {
  revalidatePath("/hage", "layout")
}

export async function createPlant(input: CreatePlantInput) {
  const { context } = await requireHousehold()
  const plant = await createPlantService(context, input)

  revalidateGarden()
  return plant
}

export async function updatePlant(input: { id: string } & UpdatePlantInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const updated = await updatePlantService(context, id, fields)

  revalidateGarden()
  return updated
}

export async function deletePlant(plantId: string) {
  const { context } = await requireHousehold()
  await deletePlantService(context, plantId)

  revalidateGarden()
}

export async function createGardenBed(input: GardenBedFields) {
  const { context } = await requireHousehold()
  const bed = await createGardenBedService(context, input)

  revalidateGarden()
  return bed
}

export async function updateGardenBed(
  input: { id: string } & UpdateGardenBedInput
) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const bed = await updateGardenBedService(context, id, fields)

  revalidateGarden()
  return bed
}

export async function deleteGardenBed(bedId: string) {
  const { context } = await requireHousehold()
  await deleteGardenBedService(context, bedId)

  revalidateGarden()
}

// ─── Bulk Import (LLM) ──────────────────────────────────────────

export async function bulkCreatePlants(input: { plants: BulkPlantInput[] }) {
  const { context } = await requireHousehold()
  const result = await bulkCreatePlantsService(context, input.plants)

  revalidateGarden()
  return result
}

/**
 * Full replace stays a server action outside `lib/application/`, so no MCP
 * tool can reach it (ADR 0004). Beds are kept: they are places in the garden,
 * not part of the plant list, and the import reuses them by name.
 */
export async function replacePlants(input: { plants: BulkPlantInput[] }) {
  const { membership } = await requireHousehold()
  assertBatchSize(input.plants.length, "Planter", { allowEmpty: true })

  await db.$transaction(async (tx) => {
    await tx.plant.deleteMany({
      where: { householdId: membership.householdId },
    })
    await createImportedPlants(tx, membership.householdId, input.plants)
  })

  revalidateGarden()
  return { count: input.plants.length }
}

export async function findExistingPlants(
  names: string[]
): Promise<ExistingPlant[]> {
  const { context } = await requireHousehold()
  return findExistingPlantsService(context, names)
}

export async function bulkImportPlantsWithDuplicates(input: {
  newPlants: BulkPlantInput[]
  updates: PlantFieldUpdate[]
}) {
  const { context } = await requireHousehold()
  const result = await importPlantsWithDuplicates(context, input)

  revalidateGarden()
  return result
}
