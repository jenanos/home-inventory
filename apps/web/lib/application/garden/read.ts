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

/** Placements in bed-name order, with the bed's name for display. */
export const plantPlacementsInclude = {
  placements: {
    select: {
      id: true,
      bedId: true,
      quantity: true,
      notes: true,
      updatedAt: true,
      bed: { select: { id: true, name: true } },
    },
    orderBy: { bed: { name: "asc" } },
  },
} satisfies Prisma.PlantInclude

export type PlantWithPlacements = Prisma.PlantGetPayload<{
  include: typeof plantPlacementsInclude
}>

export type PlantPlacementWithBed = PlantWithPlacements["placements"][number]

export async function listPlants(
  context: ApplicationContext
): Promise<PlantWithPlacements[]> {
  return db.plant.findMany({
    where: { householdId: context.householdId },
    include: plantPlacementsInclude,
    orderBy: { name: "asc" },
  })
}

export async function getPlant(
  context: ApplicationContext,
  plantId: string
): Promise<PlantWithPlacements | null> {
  return db.plant.findFirst({
    where: {
      id: plantId,
      householdId: context.householdId,
    },
    include: plantPlacementsInclude,
  })
}

// ─── Beds ───────────────────────────────────────────────────────

const bedPlantsInclude = {
  placements: {
    select: {
      id: true,
      quantity: true,
      notes: true,
      updatedAt: true,
      plant: { select: { id: true, name: true, species: true } },
    },
    orderBy: { plant: { name: "asc" } },
  },
} satisfies Prisma.GardenBedInclude

export type GardenBedWithPlants = Prisma.GardenBedGetPayload<{
  include: typeof bedPlantsInclude
}>

export async function listGardenBeds(
  context: ApplicationContext
): Promise<GardenBedWithPlants[]> {
  return db.gardenBed.findMany({
    where: { householdId: context.householdId },
    include: bedPlantsInclude,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  })
}

export async function getGardenBed(
  context: ApplicationContext,
  bedId: string
): Promise<GardenBedWithPlants | null> {
  return db.gardenBed.findFirst({
    where: { id: bedId, householdId: context.householdId },
    include: bedPlantsInclude,
  })
}

// ─── Paged reads ────────────────────────────────────────────────

type PageOptions = {
  limit: number
  offset: number
}

export type PlantFilter = {
  /** Substring of the name, species or the name of a bed it grows in. */
  query?: string
  name?: string
  /** Substring of the name of a bed the plant grows in. */
  bed?: string
  bedId?: string
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
    const contains = { contains: filter.query, mode: "insensitive" } as const
    and.push({
      OR: [
        { name: contains },
        { species: contains },
        { placements: { some: { bed: { name: contains } } } },
      ],
    })
  }
  if (filter.bed) {
    and.push({
      placements: {
        some: {
          bed: { name: { contains: filter.bed, mode: "insensitive" } },
        },
      },
    })
  }
  if (filter.bedId) {
    and.push({ placements: { some: { bedId: filter.bedId } } })
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
 * Whole rows with their placements, so the caller can report missing fields
 * and, on request, the full card. The page size bounds the response.
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
      include: plantPlacementsInclude,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: options.offset,
      take: options.limit,
    }),
  ])

  return { totalCount, plants }
}
