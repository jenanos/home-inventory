import { z } from "zod"

import {
  addPlants,
  createPlant,
  deletePlant,
  recordPlantCare,
  updatePlant,
} from "../../application/garden/write"
import { MAX_BATCH_SIZE } from "../../application/mutations"
import {
  CREATE_ANNOTATIONS,
  DELETE_ANNOTATIONS,
  defineWriteTool,
  UPDATE_ANNOTATIONS,
  type McpToolDefinition,
} from "./define"
import {
  plantCardSchema,
  plantListRowSchema,
  serializePlantCard,
  serializePlantListRow,
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
    "Adds one plant to the household's garden and always creates it, even if the name exists. Check list-plants first so the same plant is not added twice; use add-plants for several. Returns the saved plant card.",
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
    "Changes the given fields of one plant and leaves every omitted field as it is; null clears a field. Use it to fill missingFields or correct details; record watering and pruning with record-plant-care. Returns the saved plant card.",
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

export const addPlantsTool = defineWriteTool({
  name: "add-plants",
  scope: "garden:write",
  title: "Add plants",
  description: `Adds 1–${MAX_BATCH_SIZE} plants in a single all-or-nothing call, e.g. to lay out a garden from what the user describes or shows. By default a plant whose name is already in the garden (case-insensitive), or repeated in the batch, is skipped and reported with the existing plant's id, so a retry does not create duplicates; fill in or correct that plant with update-plant instead. Set onDuplicate to "create" when the user has several plants with the same name, e.g. in different beds, and give each a location.`,
  inputSchema: {
    plants: z
      .array(
        z.object({
          name: nameInputSchema,
          ...plantFieldsInputSchema,
        })
      )
      .min(1)
      .max(MAX_BATCH_SIZE),
    onDuplicate: z
      .enum(["skip", "create"])
      .optional()
      .describe(
        'What to do with a name already in the garden. Defaults to "skip".'
      ),
  },
  outputSchema: {
    created: z.array(plantCardSchema),
    skipped: z.array(
      z.object({
        name: z.string(),
        existingPlantId: z
          .string()
          .describe("The plant that already has this name."),
      })
    ),
  },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "plant",
  handler: async (args, session) => {
    const { created, skipped } = await addPlants(session.context, args.plants, {
      onDuplicate: args.onDuplicate ?? "skip",
    })

    return {
      structuredContent: {
        created: created.map(serializePlantCard),
        skipped,
      },
      summary:
        `La til ${created.length} plante(r)` +
        (skipped.length > 0
          ? `; hoppet over ${skipped.length} som finnes fra før.`
          : "."),
      resourceId: created.length === 1 ? (created[0]?.id ?? null) : null,
    }
  },
})

export const recordPlantCareTool = defineWriteTool({
  name: "record-plant-care",
  scope: "garden:write",
  title: "Record watering or pruning",
  description: `Records that 1–${MAX_BATCH_SIZE} plants were watered and/or pruned, now or at the given time, e.g. "I watered the whole terrace bed". A plant that already has the same or a later date keeps it, so repeating the call, or recording an older event, changes nothing. If any id is not a plant in the household, nothing changes. Returns the plants as list rows.`,
  inputSchema: {
    plantIds: z
      .array(idSchema)
      .min(1)
      .max(MAX_BATCH_SIZE)
      .describe("Plant ids from list-plants."),
    watered: z.boolean().optional().describe("Set lastWateredAt."),
    pruned: z.boolean().optional().describe("Set lastPrunedAt."),
    at: timestampInputSchema
      .optional()
      .describe(
        "When it was done, as an ISO 8601 timestamp. Defaults to now; cannot be in the future."
      ),
  },
  outputSchema: { plants: z.array(plantListRowSchema) },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "plant",
  handler: async (args, session) => {
    const plants = await recordPlantCare(session.context, args.plantIds, {
      watered: args.watered,
      pruned: args.pruned,
      at: args.at,
    })
    const done = [args.watered && "vanning", args.pruned && "beskjæring"]
      .filter(Boolean)
      .join(" og ")

    return {
      structuredContent: { plants: plants.map(serializePlantListRow) },
      summary: `Registrerte ${done} for ${plants.length} plante(r).`,
      resourceId: plants.length === 1 ? (plants[0]?.id ?? null) : null,
    }
  },
})

export const deletePlantTool = defineWriteTool({
  name: "delete-plant",
  scope: "garden:write",
  title: "Delete a plant",
  description:
    "Permanently deletes one plant. For mistakes, duplicates and plants that are gone from the garden; confirm with the user before deleting. To merge a duplicate, copy what is worth keeping to the other plant with update-plant first.",
  inputSchema: {
    plantId: idSchema.describe("Id from list-plants."),
  },
  outputSchema: {
    deleted: z.object({ id: z.string(), name: z.string() }),
  },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "plant",
  handler: async (args, session) => {
    const deleted = await deletePlant(session.context, args.plantId)

    return {
      structuredContent: { deleted },
      summary: `Slettet planten ${deleted.name}.`,
      resourceId: deleted.id,
    }
  },
})

export const gardenWriteTools: McpToolDefinition[] = [
  createPlantTool,
  addPlantsTool,
  updatePlantTool,
  recordPlantCareTool,
  deletePlantTool,
]
