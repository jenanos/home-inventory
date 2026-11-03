import type { Plant } from "@workspace/db"
import { z } from "zod"

import { getPlant, listPlantsPage } from "../../application/garden/read"
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
  timestampSchema,
} from "./shared"

export const listPlantsTool = defineTool({
  name: "list-plants",
  scope: "garden:read",
  title: "List plants",
  description:
    "Lists the household's plants in name order, with the care attributes needed to answer watering and placement questions. Use get-plant for the full card.",
  inputSchema: {
    name: filterTextSchema
      .optional()
      .describe("Case-insensitive substring match on the plant name."),
    location: filterTextSchema
      .optional()
      .describe("Case-insensitive substring match on the location."),
    plantType: z.enum(PLANT_TYPES).optional(),
    wateringNeed: z.enum(WATERING_NEEDS).optional(),
    sunNeed: z.enum(SUN_NEEDS).optional(),
    ...paginationInputSchema,
  },
  outputSchema: {
    plants: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        species: z.string().nullable(),
        location: z.string().nullable(),
        plantType: z.enum(PLANT_TYPES).nullable(),
        lifecycle: z.enum(LIFECYCLES).nullable(),
        wateringNeed: z.enum(WATERING_NEEDS).nullable(),
        wateringMethod: z.enum(WATERING_METHODS).nullable(),
        sunNeed: z.enum(SUN_NEEDS).nullable(),
        isToxic: z.boolean(),
        lastWateredAt: timestampSchema.nullable(),
        updatedAt: timestampSchema,
      })
    ),
    pageInfo: pageInfoSchema,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    const page = resolvePageRequest(args)
    const { totalCount, plants } = await listPlantsPage(session.context, {
      ...page,
      name: args.name,
      location: args.location,
      plantType: args.plantType,
      wateringNeed: args.wateringNeed,
      sunNeed: args.sunNeed,
    })

    const serialized = plants.map((plant) => ({
      ...plant,
      lastWateredAt: optionalTimestamp(plant.lastWateredAt),
      updatedAt: timestamp(plant.updatedAt),
    }))

    return toolSuccess(
      {
        plants: serialized,
        pageInfo: buildPageInfo(page, serialized.length, totalCount),
      },
      `Fant ${totalCount} plante(r); viser ${serialized.length}.`
    )
  },
})

/**
 * The full plant card: what get-plant returns and what every plant write tool
 * returns after saving, so a client sees one shape for one resource.
 */
export const plantCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: z.string().nullable(),
  location: z.string().nullable(),
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
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export function serializePlantCard(
  plant: Plant
): z.infer<typeof plantCardSchema> {
  return {
    id: plant.id,
    name: plant.name,
    species: plant.species,
    location: plant.location,
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
    createdAt: timestamp(plant.createdAt),
    updatedAt: timestamp(plant.updatedAt),
  }
}

export const getPlantTool = defineTool({
  name: "get-plant",
  scope: "garden:read",
  title: "Get a plant",
  description:
    "Returns the full plant card, including care instructions, soil, pests and toxicity notes. Use list-plants to find the id.",
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
      `${plant.name}${plant.location ? ` (${plant.location})` : ""}.`
    )
  },
})

export const gardenTools = [listPlantsTool, getPlantTool]
