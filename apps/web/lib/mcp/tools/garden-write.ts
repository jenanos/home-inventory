import { z } from "zod"

import { createPlant, updatePlant } from "../../application/garden/write"
import {
  CREATE_ANNOTATIONS,
  defineWriteTool,
  UPDATE_ANNOTATIONS,
} from "./define"
import { plantCardSchema, serializePlantCard } from "./garden"
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
  location: shortTextInputSchema.describe(
    "Where the plant grows, e.g. 'Bed by the terrace'."
  ),
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

export const createPlantTool = defineWriteTool({
  name: "create-plant",
  scope: "garden:write",
  title: "Create a plant",
  description:
    "Adds a plant to the household's garden. Check list-plants first so the same plant is not added twice. Returns the saved plant card.",
  inputSchema: {
    name: nameInputSchema,
    ...plantFieldsInputSchema,
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
    "Changes the given fields of one plant and leaves every omitted field as it is; null clears a field. Use it to record watering or pruning by setting lastWateredAt or lastPrunedAt. Returns the saved plant card.",
  inputSchema: {
    plantId: idSchema.describe("Id from list-plants."),
    name: nameInputSchema.optional(),
    ...plantFieldsInputSchema,
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

export const gardenWriteTools = [createPlantTool, updatePlantTool]
