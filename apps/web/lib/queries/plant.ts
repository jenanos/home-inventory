import type { ApplicationContext } from "@/lib/application/context"
import {
  getGardenBed as readGardenBed,
  getPlant as readPlant,
  listGardenBeds,
  listPlants,
} from "@/lib/application/garden/read"

export async function getPlants(context: ApplicationContext) {
  return listPlants(context)
}

export async function getPlant(context: ApplicationContext, plantId: string) {
  return readPlant(context, plantId)
}

export async function getGardenBeds(context: ApplicationContext) {
  return listGardenBeds(context)
}

export async function getGardenBed(context: ApplicationContext, bedId: string) {
  return readGardenBed(context, bedId)
}
