import {
  db,
  type PlantType,
  type Prisma,
  type SunNeed,
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
  name?: string
  /** Case-insensitive substring of the name of any bed the plant grows in. */
  bed?: string
  bedId?: string
  plantType?: PlantType
  wateringNeed?: WateringNeed
  sunNeed?: SunNeed
}

function plantFilter(
  context: ApplicationContext,
  filter: PlantFilter
): Prisma.PlantWhereInput {
  const placementFilter: Prisma.PlantPlacementWhereInput[] = []
  if (filter.bed) {
    placementFilter.push({
      bed: { name: { contains: filter.bed, mode: "insensitive" } },
    })
  }
  if (filter.bedId) {
    placementFilter.push({ bedId: filter.bedId })
  }

  return {
    householdId: context.householdId,
    ...(filter.name
      ? { name: { contains: filter.name, mode: "insensitive" } }
      : {}),
    ...(placementFilter.length > 0
      ? { placements: { some: { AND: placementFilter } } }
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
        plantType: true,
        lifecycle: true,
        wateringNeed: true,
        wateringMethod: true,
        sunNeed: true,
        isToxic: true,
        lastWateredAt: true,
        updatedAt: true,
        placements: plantPlacementsInclude.placements,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: options.offset,
      take: options.limit,
    }),
  ])

  return { totalCount, plants }
}
