import { db } from "@workspace/db"

export async function getPlants(householdId: string) {
  return db.plant.findMany({
    where: { householdId },
    orderBy: { name: "asc" },
  })
}

export async function getPlant(plantId: string, householdId: string) {
  const plant = await db.plant.findUnique({
    where: { id: plantId },
  })

  if (!plant || plant.householdId !== householdId) {
    return null
  }

  return plant
}
