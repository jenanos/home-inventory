import { z } from "zod"

import {
  MAX_PLACEMENT_QUANTITY,
  createGardenBed,
  createPlant,
  deleteGardenBed,
  deletePlant,
  updateGardenBed,
  updatePlant,
} from "../../application/garden/write"
import { MAX_BATCH_SIZE } from "../../application/mutations"
import {
  CREATE_ANNOTATIONS,
  DELETE_ANNOTATIONS,
  defineWriteTool,
  UPDATE_ANNOTATIONS,
} from "./define"
import {
  gardenBedSchema,
  plantCardSchema,
  serializeGardenBed,
  serializePlantCard,
} from "./garden"
import {
  LIFECYCLES,
  PLANT_TYPES,
  SUN_NEEDS,
  WATERING_METHODS,
  WATERING_NEEDS,
  calendarDateInputSchema,
  expectedUpdatedAtSchema,
  idSchema,
  longTextInputSchema,
  nameInputSchema,
  parseExpectedUpdatedAt,
  shortTextInputSchema,
  timestampInputSchema,
  urlInputSchema,
} from "./shared"

/** Every optional plant field. Omit a field to leave it unchanged; null clears it. */
const plantFieldsInputSchema = {
  species: shortTextInputSchema,
  description: longTextInputSchema,
  careInstructions: longTextInputSchema,
  plantType: z.enum(PLANT_TYPES).nullable().optional(),
  lifecycle: z.enum(LIFECYCLES).nullable().optional(),
  wateringNeed: z.enum(WATERING_NEEDS).nullable().optional(),
  wateringMethod: z.enum(WATERING_METHODS).nullable().optional(),
  sunNeed: z.enum(SUN_NEEDS).nullable().optional(),
  soilType: shortTextInputSchema,
  fertilizer: shortTextInputSchema,
  hardinessZone: shortTextInputSchema,
  bloomTime: shortTextInputSchema,
  pruningSeason: shortTextInputSchema,
  pests: longTextInputSchema,
  notes: longTextInputSchema,
  isToxic: z.boolean().optional(),
  toxicityNotes: shortTextInputSchema,
  plantedAt: calendarDateInputSchema.nullable().optional(),
  lastWateredAt: timestampInputSchema
    .nullable()
    .optional()
    .describe("When the plant was last watered, as an ISO 8601 timestamp."),
  lastPrunedAt: timestampInputSchema.nullable().optional(),
  imageUrl: urlInputSchema,
  sourceUrl: urlInputSchema,
}

const placementsInputSchema = z
  .array(
    z.object({
      bedId: idSchema.describe("Id from list-garden-beds."),
      quantity: z
        .number()
        .int()
        .min(1)
        .max(MAX_PLACEMENT_QUANTITY)
        .nullable()
        .optional()
        .describe("How many of the plant grow in this bed, if known."),
      notes: shortTextInputSchema.describe(
        "Where in the bed, e.g. 'back row by the fence'."
      ),
    })
  )
  .max(MAX_BATCH_SIZE)

export const createPlantTool = defineWriteTool({
  name: "create-plant",
  scope: "garden:write",
  title: "Create a plant",
  description:
    "Adds a plant to the household's garden. One plant record covers every bed it grows in, so check list-plants first: if the plant already exists, add the bed to it with update-plant instead of creating a duplicate. Returns the saved plant card.",
  inputSchema: {
    name: nameInputSchema,
    ...plantFieldsInputSchema,
    placements: placementsInputSchema
      .optional()
      .describe(
        "The beds the plant grows in. Create missing beds first with create-garden-bed."
      ),
  },
  outputSchema: { plant: plantCardSchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "plant",
  handler: async (args, session) => {
    const plant = await createPlant(session.context, args)

    return {
      structuredContent: { plant: serializePlantCard(plant) },
      summary: `Opprettet planten ${plant.name}.`,
      resourceId: plant.id,
    }
  },
})

export const updatePlantTool = defineWriteTool({
  name: "update-plant",
  scope: "garden:write",
  title: "Update a plant",
  description:
    "Changes the given fields of one plant and leaves every omitted field as it is; null clears a field. Use it to record watering or pruning by setting lastWateredAt or lastPrunedAt, and to move a plant or add it to another bed through placements. Returns the saved plant card.",
  inputSchema: {
    plantId: idSchema.describe("Id from list-plants."),
    name: nameInputSchema.optional(),
    ...plantFieldsInputSchema,
    placements: placementsInputSchema
      .optional()
      .describe(
        "The complete list of beds the plant grows in after the call: beds left out are removed from the plant. Read the current placements with get-plant first. Omit to leave placements unchanged."
      ),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { plant: plantCardSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "plant",
  handler: async (args, session) => {
    const { plantId, expectedUpdatedAt, ...fields } = args
    const plant = await updatePlant(session.context, plantId, {
      ...fields,
      expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
    })

    return {
      structuredContent: { plant: serializePlantCard(plant) },
      summary: `Oppdaterte planten ${plant.name}.`,
      resourceId: plant.id,
    }
  },
})

export const deletePlantTool = defineWriteTool({
  name: "delete-plant",
  scope: "garden:write",
  title: "Delete a plant",
  description:
    "Permanently deletes one plant with its placements in every bed. To take a plant out of one bed only, use update-plant with the remaining placements. Delete only mistakes, duplicates and plants that are gone, and confirm with the user first.",
  inputSchema: {
    plantId: idSchema.describe("Id from list-plants."),
  },
  outputSchema: { deletedPlantId: z.string() },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "plant",
  handler: async (args, session) => {
    const plant = await deletePlant(session.context, args.plantId)

    return {
      structuredContent: { deletedPlantId: plant.id },
      summary: `Slettet planten ${plant.name}.`,
      resourceId: plant.id,
    }
  },
})

// ─── Beds ───────────────────────────────────────────────────────

const bedFieldsInputSchema = {
  description: longTextInputSchema,
  sunExposure: z
    .enum(SUN_NEEDS)
    .nullable()
    .optional()
    .describe("How much sun the bed gets."),
  notes: longTextInputSchema,
}

export const createGardenBedTool = defineWriteTool({
  name: "create-garden-bed",
  scope: "garden:write",
  title: "Create a garden bed",
  description:
    "Adds a named bed or area to the garden, e.g. 'Right perennial bed'. Names are unique per household, ignoring case; check list-garden-beds first. Returns the saved bed.",
  inputSchema: {
    name: nameInputSchema,
    ...bedFieldsInputSchema,
  },
  outputSchema: { bed: gardenBedSchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "garden_bed",
  handler: async (args, session) => {
    const bed = await createGardenBed(session.context, args)

    return {
      structuredContent: { bed: serializeGardenBed(bed) },
      summary: `Opprettet bedet ${bed.name}.`,
      resourceId: bed.id,
    }
  },
})

export const updateGardenBedTool = defineWriteTool({
  name: "update-garden-bed",
  scope: "garden:write",
  title: "Update a garden bed",
  description:
    "Changes the given fields of one bed and leaves every omitted field as it is; null clears a field. Returns the saved bed.",
  inputSchema: {
    bedId: idSchema.describe("Id from list-garden-beds."),
    name: nameInputSchema.optional(),
    ...bedFieldsInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { bed: gardenBedSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "garden_bed",
  handler: async (args, session) => {
    const { bedId, expectedUpdatedAt, ...fields } = args
    const bed = await updateGardenBed(session.context, bedId, {
      ...fields,
      expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
    })

    return {
      structuredContent: { bed: serializeGardenBed(bed) },
      summary: `Oppdaterte bedet ${bed.name}.`,
      resourceId: bed.id,
    }
  },
})

export const deleteGardenBedTool = defineWriteTool({
  name: "delete-garden-bed",
  scope: "garden:write",
  title: "Delete a garden bed",
  description:
    "Permanently deletes one bed. The plants in it are kept, but lose their placement in this bed. Confirm with the user first.",
  inputSchema: {
    bedId: idSchema.describe("Id from list-garden-beds."),
  },
  outputSchema: { deletedBedId: z.string() },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "garden_bed",
  handler: async (args, session) => {
    const bed = await deleteGardenBed(session.context, args.bedId)

    return {
      structuredContent: { deletedBedId: bed.id },
      summary: `Slettet bedet ${bed.name}.`,
      resourceId: bed.id,
    }
  },
})

export const gardenWriteTools = [
  createPlantTool,
  updatePlantTool,
  deletePlantTool,
  createGardenBedTool,
  updateGardenBedTool,
  deleteGardenBedTool,
]
