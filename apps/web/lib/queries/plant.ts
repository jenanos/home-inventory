import type { ApplicationContext } from "@/lib/application/context"
import {
  getPlant as readPlant,
  listPlants,
} from "@/lib/application/garden/read"

export async function getPlants(context: ApplicationContext) {
  return listPlants(context)
}

export async function getPlant(context: ApplicationContext, plantId: string) {
  return readPlant(context, plantId)
}
