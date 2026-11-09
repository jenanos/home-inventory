"use server"

import {
  createPlant as createPlantService,
  deletePlant as deletePlantService,
  recordPlantCare as recordPlantCareService,
  updatePlant as updatePlantService,
  type PlantFields,
  type UpdatePlantInput,
} from "@/lib/application/garden/write"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

// --- Plant CRUD actions ---
//
// Thin adapters: the browser context comes from the session, the rules and the
// ownership boundary live in the garden write service shared with MCP.

export async function createPlant(input: PlantFields) {
  const { context } = await requireHousehold()
  const plant = await createPlantService(context, input)

  revalidatePath("/hage")
  return plant
}

export async function updatePlant(input: { id: string } & UpdatePlantInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const updated = await updatePlantService(context, id, fields)

  revalidatePath("/hage")
  revalidatePath(`/hage/${id}`)
  return updated
}

export async function deletePlant(plantId: string) {
  const { context } = await requireHousehold()
  await deletePlantService(context, plantId)

  revalidatePath("/hage")
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

  revalidatePath("/hage")
}
