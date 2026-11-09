"use server"

import {
  createGardenBed as createGardenBedService,
  createPlant as createPlantService,
  deleteGardenBed as deleteGardenBedService,
  deletePlant as deletePlantService,
  recordPlantCare as recordPlantCareService,
  updateGardenBed as updateGardenBedService,
  updatePlant as updatePlantService,
  type CreatePlantInput,
  type GardenBedFields,
  type UpdateGardenBedInput,
  type UpdatePlantInput,
} from "@/lib/application/garden/write"
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

/** "Vannet i dag" / "Beskåret i dag" on the plant card. */
export async function recordPlantCare(input: {
  plantId: string
  watered?: boolean
  pruned?: boolean
}) {
  const { context } = await requireHousehold()
  await recordPlantCareService(context, [input.plantId], {
    watered: input.watered,
    pruned: input.pruned,
  })

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
