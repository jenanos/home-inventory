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
  /** Substring of the name, species or location. */
  query?: string
  name?: string
  location?: string
  plantType?: PlantType
  lifecycle?: Lifecycle
  wateringNeed?: WateringNeed
  wateringMethod?: WateringMethod
  sunNeed?: SunNeed
  isToxic?: boolean
  /** Plants never watered, or last watered before this moment. */
  notWateredSince?: Date
}

function plantFilter(
  context: ApplicationContext,
  filter: PlantFilter
): Prisma.PlantWhereInput {
  const and: Prisma.PlantWhereInput[] = []

  if (filter.query) {
    and.push({
      OR: (["name", "species", "location"] as const).map((field) => ({
        [field]: { contains: filter.query, mode: "insensitive" },
      })),
    })
  }
  if (filter.notWateredSince) {
    and.push({
      OR: [
        { lastWateredAt: null },
        { lastWateredAt: { lt: filter.notWateredSince } },
      ],
    })
  }

  return {
    householdId: context.householdId,
    ...(filter.name
      ? { name: { contains: filter.name, mode: "insensitive" } }
      : {}),
    ...(filter.location
      ? { location: { contains: filter.location, mode: "insensitive" } }
      : {}),
    ...(filter.plantType ? { plantType: filter.plantType } : {}),
    ...(filter.lifecycle ? { lifecycle: filter.lifecycle } : {}),
    ...(filter.wateringNeed ? { wateringNeed: filter.wateringNeed } : {}),
    ...(filter.wateringMethod ? { wateringMethod: filter.wateringMethod } : {}),
    ...(filter.sunNeed ? { sunNeed: filter.sunNeed } : {}),
    ...(filter.isToxic !== undefined ? { isToxic: filter.isToxic } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  }
}

/**
 * Whole rows, so the caller can report missing fields and, on request, the
 * full card. The page size bounds the response.
 */
export async function listPlantsPage(
  context: ApplicationContext,
  options: PageOptions & PlantFilter
) {
  const where = plantFilter(context, options)

  const [totalCount, plants] = await Promise.all([
    db.plant.count({ where }),
    db.plant.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: options.offset,
      take: options.limit,
    }),
  ])

  return { totalCount, plants }
}
