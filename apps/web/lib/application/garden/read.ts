import {
  db,
  type PlantType,
  type Prisma,
  type SunNeed,
  type WateringNeed,
} from "@workspace/db"

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

// ─── Paged reads ────────────────────────────────────────────────

type PageOptions = {
  limit: number
  offset: number
}

export type PlantFilter = {
  name?: string
  location?: string
  plantType?: PlantType
  wateringNeed?: WateringNeed
  sunNeed?: SunNeed
}

function plantFilter(
  context: ApplicationContext,
  filter: PlantFilter
): Prisma.PlantWhereInput {
  return {
    householdId: context.householdId,
    ...(filter.name
      ? { name: { contains: filter.name, mode: "insensitive" } }
      : {}),
    ...(filter.location
      ? { location: { contains: filter.location, mode: "insensitive" } }
      : {}),
    ...(filter.plantType ? { plantType: filter.plantType } : {}),
    ...(filter.wateringNeed ? { wateringNeed: filter.wateringNeed } : {}),
    ...(filter.sunNeed ? { sunNeed: filter.sunNeed } : {}),
  }
}

export async function listPlantsPage(
  context: ApplicationContext,
  options: PageOptions & PlantFilter
) {
  const where = plantFilter(context, options)

  const [totalCount, plants] = await Promise.all([
    db.plant.count({ where }),
    db.plant.findMany({
      where,
      select: {
        id: true,
        name: true,
        species: true,
        location: true,
        plantType: true,
        lifecycle: true,
        wateringNeed: true,
        wateringMethod: true,
        sunNeed: true,
        isToxic: true,
        lastWateredAt: true,
        updatedAt: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: options.offset,
      take: options.limit,
    }),
  ])

  return { totalCount, plants }
}
