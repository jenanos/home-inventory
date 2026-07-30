import { db } from "@workspace/db"

import type { ApplicationContext } from "../context"

export async function listPlants(context: ApplicationContext) {
  return db.plant.findMany({
    where: { householdId: context.householdId },
    orderBy: { name: "asc" },
  })
}

export async function getPlant(context: ApplicationContext, plantId: string) {
  return db.plant.findFirst({
    where: {
      id: plantId,
      householdId: context.householdId,
    },
  })
}
