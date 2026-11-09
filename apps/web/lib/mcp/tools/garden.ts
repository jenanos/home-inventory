import type { GardenBed } from "@workspace/db"
import { z } from "zod"

import { missingPlantFields } from "../../application/garden/fields"
import {
  getGardenBed,
  getPlant,
  listGardenBeds,
  listPlantsPage,
  type GardenBedWithPlants,
  type PlantPlacementWithBed,
  type PlantWithPlacements,
} from "../../application/garden/read"
import {
  buildPageInfo,
  pageInfoSchema,
  paginationInputSchema,
  resolvePageRequest,
} from "../pagination"
import { notFoundError, toolSuccess } from "../result"
import { defineTool, READ_ONLY_ANNOTATIONS } from "./define"
import {
  LIFECYCLES,
  PLANT_TYPES,
  SUN_NEEDS,
  WATERING_METHODS,
  WATERING_NEEDS,
  assertId,
  calendarDate,
  calendarDateOutputSchema,
  filterTextSchema,
  idSchema,
  optionalTimestamp,
  timestamp,
  timestampInputSchema,
  timestampSchema,
} from "./shared"

/** Full cards are long; a detailed page holds at most this many plants. */
const MAX_DETAILED_PAGE_SIZE = 25

const missingFieldsSchema = z
  .array(z.string())
  .describe(
    "Optional care fields that are empty for this plant, e.g. species, sunNeed or careInstructions. Fill them from what the user tells you or a reliable source; never guess."
  )

/** Where a plant grows: one entry per bed. */
export const placementSchema = z.object({
  bedId: z.string(),
  bedName: z.string(),
  quantity: z.number().int().nullable(),
  notes: z.string().nullable(),
})

const placementsSchema = z
  .array(placementSchema)
  .describe(
    "The beds the plant grows in. One plant can grow in several beds; an empty list means no bed is recorded."
  )

export function serializePlacements(placements: PlantPlacementWithBed[]) {
  return placements.map((placement) => ({
    bedId: placement.bed.id,
    bedName: placement.bed.name,
    quantity: placement.quantity,
    notes: placement.notes,
  }))
}

/**
 * The full plant card: what get-plant returns and what every plant write tool
 * returns after saving, so a client sees one shape for one resource.
 */
export const plantCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: z.string().nullable(),
  placements: placementsSchema,
  description: z.string().nullable(),
  careInstructions: z.string().nullable(),
  plantType: z.enum(PLANT_TYPES).nullable(),
  lifecycle: z.enum(LIFECYCLES).nullable(),
  wateringNeed: z.enum(WATERING_NEEDS).nullable(),
  wateringMethod: z.enum(WATERING_METHODS).nullable(),
  sunNeed: z.enum(SUN_NEEDS).nullable(),
  soilType: z.string().nullable(),
  fertilizer: z.string().nullable(),
  hardinessZone: z.string().nullable(),
  bloomTime: z.string().nullable(),
  pruningSeason: z.string().nullable(),
  pests: z.string().nullable(),
  notes: z.string().nullable(),
  isToxic: z.boolean(),
  toxicityNotes: z.string().nullable(),
  plantedAt: calendarDateOutputSchema,
  lastWateredAt: timestampSchema.nullable(),
  lastPrunedAt: timestampSchema.nullable(),
  // `imageUrl` and `sourceUrl` are returned as data only. The server never
  // fetches them (chapter 11 point 17).
  imageUrl: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  missingFields: missingFieldsSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export function serializePlantCard(
  plant: PlantWithPlacements
): z.infer<typeof plantCardSchema> {
  return {
    id: plant.id,
    name: plant.name,
    species: plant.species,
    placements: serializePlacements(plant.placements),
    description: plant.description,
    careInstructions: plant.careInstructions,
    plantType: plant.plantType,
    lifecycle: plant.lifecycle,
    wateringNeed: plant.wateringNeed,
    wateringMethod: plant.wateringMethod,
    sunNeed: plant.sunNeed,
    soilType: plant.soilType,
    fertilizer: plant.fertilizer,
    hardinessZone: plant.hardinessZone,
    bloomTime: plant.bloomTime,
    pruningSeason: plant.pruningSeason,
    pests: plant.pests,
    notes: plant.notes,
    isToxic: plant.isToxic,
    toxicityNotes: plant.toxicityNotes,
    plantedAt: calendarDate(plant.plantedAt),
    lastWateredAt: optionalTimestamp(plant.lastWateredAt),
    lastPrunedAt: optionalTimestamp(plant.lastPrunedAt),
    imageUrl: plant.imageUrl,
    sourceUrl: plant.sourceUrl,
    missingFields: missingPlantFields(plant),
    createdAt: timestamp(plant.createdAt),
    updatedAt: timestamp(plant.updatedAt),
  }
}

/**
 * A list row: the care attributes needed to answer watering and placement
 * questions, plus missing fields. With `includeDetails` it is the full card.
 */
export const plantListRowSchema = plantCardSchema.partial().extend({
  id: z.string(),
  name: z.string(),
  species: z.string().nullable(),
  placements: placementsSchema,
  plantType: z.enum(PLANT_TYPES).nullable(),
  lifecycle: z.enum(LIFECYCLES).nullable(),
  wateringNeed: z.enum(WATERING_NEEDS).nullable(),
  wateringMethod: z.enum(WATERING_METHODS).nullable(),
  sunNeed: z.enum(SUN_NEEDS).nullable(),
  isToxic: z.boolean(),
  lastWateredAt: timestampSchema.nullable(),
  lastPrunedAt: timestampSchema.nullable(),
  missingFields: missingFieldsSchema,
  updatedAt: timestampSchema,
})

export function serializePlantListRow(
  plant: PlantWithPlacements
): z.infer<typeof plantListRowSchema> {
  return {
    id: plant.id,
    name: plant.name,
    species: plant.species,
    placements: serializePlacements(plant.placements),
    plantType: plant.plantType,
    lifecycle: plant.lifecycle,
    wateringNeed: plant.wateringNeed,
    wateringMethod: plant.wateringMethod,
    sunNeed: plant.sunNeed,
    isToxic: plant.isToxic,
    lastWateredAt: optionalTimestamp(plant.lastWateredAt),
    lastPrunedAt: optionalTimestamp(plant.lastPrunedAt),
    missingFields: missingPlantFields(plant),
    updatedAt: timestamp(plant.updatedAt),
  }
}

export const listPlantsTool = defineTool({
  name: "list-plants",
  scope: "garden:read",
  title: "List plants",
  description: `Lists the household's plants in name order, with the beds each one grows in, the care attributes needed to answer watering and placement questions and the empty fields worth filling in (missingFields). Set includeDetails to get full plant cards, e.g. to review the whole garden; a detailed page holds at most ${MAX_DETAILED_PAGE_SIZE} plants. Use notWateredSince to find plants that need water.`,
  inputSchema: {
    query: filterTextSchema
      .optional()
      .describe(
        "Case-insensitive substring match on the name, species or the name of a bed the plant grows in."
      ),
    name: filterTextSchema
      .optional()
      .describe("Case-insensitive substring match on the plant name."),
    bed: filterTextSchema
      .optional()
      .describe(
        "Case-insensitive substring match on the name of a bed the plant grows in."
      ),
    bedId: idSchema.optional().describe("Only plants in this bed."),
    plantType: z.enum(PLANT_TYPES).optional(),
    lifecycle: z.enum(LIFECYCLES).optional(),
    wateringNeed: z.enum(WATERING_NEEDS).optional(),
    wateringMethod: z.enum(WATERING_METHODS).optional(),
    sunNeed: z.enum(SUN_NEEDS).optional(),
    isToxic: z.boolean().optional(),
    notWateredSince: timestampInputSchema
      .optional()
      .describe(
        "Only plants never watered, or last watered before this ISO 8601 timestamp."
      ),
    includeDetails: z
      .boolean()
      .optional()
      .describe("Return full plant cards instead of the short rows."),
    ...paginationInputSchema,
  },
  outputSchema: {
    plants: z.array(plantListRowSchema),
    pageInfo: pageInfoSchema,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    if (args.bedId) assertId(args.bedId, "bedId")
    const requested = resolvePageRequest(args)
    const page = args.includeDetails
      ? {
          ...requested,
          limit: Math.min(requested.limit, MAX_DETAILED_PAGE_SIZE),
        }
      : requested
    const { totalCount, plants } = await listPlantsPage(session.context, {
      ...page,
      query: args.query,
      name: args.name,
      bed: args.bed,
      bedId: args.bedId,
      plantType: args.plantType,
      lifecycle: args.lifecycle,
      wateringNeed: args.wateringNeed,
      wateringMethod: args.wateringMethod,
      sunNeed: args.sunNeed,
      isToxic: args.isToxic,
      notWateredSince: args.notWateredSince
        ? new Date(args.notWateredSince)
        : undefined,
    })

    const serialized = plants.map((plant) =>
      args.includeDetails
        ? serializePlantCard(plant)
        : serializePlantListRow(plant)
    )

    return toolSuccess(
      {
        plants: serialized,
        pageInfo: buildPageInfo(page, serialized.length, totalCount),
      },
      `Fant ${totalCount} plante(r); viser ${serialized.length}.`
    )
  },
})

export const getPlantTool = defineTool({
  name: "get-plant",
  scope: "garden:read",
  title: "Get a plant",
  description:
    "Returns the full plant card, including care instructions, soil, pests, toxicity notes and missingFields. Use list-plants to find the id.",
  inputSchema: {
    plantId: idSchema.describe("Id from list-plants."),
  },
  outputSchema: {
    plant: plantCardSchema,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    assertId(args.plantId, "plantId")

    const plant = await getPlant(session.context, args.plantId)
    if (!plant) {
      return notFoundError("plante")
    }

    return toolSuccess(
      { plant: serializePlantCard(plant) },
      `${plant.name}${describeBeds(plant.placements)}.`
    )
  },
})

function describeBeds(placements: PlantPlacementWithBed[]) {
  return placements.length > 0
    ? ` (${placements.map((placement) => placement.bed.name).join(", ")})`
    : ""
}

// ─── Beds ───────────────────────────────────────────────────────

export const gardenBedSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sunExposure: z.enum(SUN_NEEDS).nullable(),
  notes: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export function serializeGardenBed(
  bed: GardenBed
): z.infer<typeof gardenBedSchema> {
  return {
    id: bed.id,
    name: bed.name,
    description: bed.description,
    sunExposure: bed.sunExposure,
    notes: bed.notes,
    createdAt: timestamp(bed.createdAt),
    updatedAt: timestamp(bed.updatedAt),
  }
}

const bedPlantSchema = z.object({
  plantId: z.string(),
  name: z.string(),
  species: z.string().nullable(),
  quantity: z.number().int().nullable(),
  notes: z.string().nullable(),
})

const gardenBedWithPlantsSchema = gardenBedSchema.extend({
  plants: z.array(bedPlantSchema),
})

function serializeGardenBedWithPlants(bed: GardenBedWithPlants) {
  return {
    ...serializeGardenBed(bed),
    plants: bed.placements.map((placement) => ({
      plantId: placement.plant.id,
      name: placement.plant.name,
      species: placement.plant.species,
      quantity: placement.quantity,
      notes: placement.notes,
    })),
  }
}

export const listGardenBedsTool = defineTool({
  name: "list-garden-beds",
  scope: "garden:read",
  title: "List garden beds",
  description:
    "Lists the household's garden beds in name order, each with the plants growing in it. Use the bed ids to place plants with create-plant or update-plant.",
  inputSchema: {},
  outputSchema: {
    beds: z.array(gardenBedWithPlantsSchema),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (_args, session) => {
    const beds = await listGardenBeds(session.context)

    return toolSuccess(
      { beds: beds.map(serializeGardenBedWithPlants) },
      `Fant ${beds.length} bed.`
    )
  },
})

export const getGardenBedTool = defineTool({
  name: "get-garden-bed",
  scope: "garden:read",
  title: "Get a garden bed",
  description:
    "Returns one garden bed with its description, sun exposure, notes and the plants growing in it.",
  inputSchema: {
    bedId: idSchema.describe("Id from list-garden-beds."),
  },
  outputSchema: {
    bed: gardenBedWithPlantsSchema,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    assertId(args.bedId, "bedId")

    const bed = await getGardenBed(session.context, args.bedId)
    if (!bed) {
      return notFoundError("bed")
    }

    return toolSuccess(
      { bed: serializeGardenBedWithPlants(bed) },
      `${bed.name}: ${bed.placements.length} plante(r).`
    )
  },
})

export const gardenTools = [
  listPlantsTool,
  getPlantTool,
  listGardenBedsTool,
  getGardenBedTool,
]
