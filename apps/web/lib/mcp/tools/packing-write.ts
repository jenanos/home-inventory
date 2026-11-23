import { z } from "zod"

import { MAX_BATCH_SIZE } from "../../application/mutations"
import {
  MAX_PACKING_QUANTITY,
  addBundlesToList,
  addPackingItems,
  createPackingBundle,
  createPackingList,
  deletePackingBundle,
  deletePackingItems,
  deletePackingList,
  duplicatePackingList,
  removeBundleFromList,
  setPackingItemsPacked,
  updatePackingBundle,
  updatePackingItem,
  updatePackingList,
  type PackingChangeResult,
} from "../../application/packing/write"
import {
  CREATE_ANNOTATIONS,
  DELETE_ANNOTATIONS,
  defineWriteTool,
  UPDATE_ANNOTATIONS,
} from "./define"
import {
  packingBundleSchema,
  packingItemSchema,
  packingListCardSchema,
  serializePackingBundle,
  serializePackingList,
} from "./packing"
import {
  PACKING_DURATIONS,
  PACKING_SEASONS,
  calendarDateInputSchema,
  expectedUpdatedAtSchema,
  idSchema,
  longTextInputSchema,
  nameInputSchema,
  parseExpectedUpdatedAt,
  shortTextInputSchema,
  timestamp,
} from "./shared"

const tripInputSchema = {
  season: z.enum(PACKING_SEASONS).nullable().optional(),
  duration: z
    .enum(PACKING_DURATIONS)
    .nullable()
    .optional()
    .describe(
      "DAY = day trip, WEEKEND = 1–3 nights, WEEK = 4–8 nights, LONG = more than 8 nights."
    ),
  abroad: z.boolean().optional().describe("A trip abroad."),
  departureOn: calendarDateInputSchema.nullable().optional(),
  notes: longTextInputSchema,
}

const itemInputSchema = z.object({
  name: nameInputSchema,
  quantity: z
    .number()
    .int()
    .min(1)
    .max(MAX_PACKING_QUANTITY)
    .optional()
    .describe("How many to pack. Defaults to 1."),
  notes: shortTextInputSchema,
})

const bundleFieldsInputSchema = {
  description: shortTextInputSchema,
  seasons: z
    .array(z.enum(PACKING_SEASONS))
    .max(PACKING_SEASONS.length)
    .optional()
    .describe("Seasons the bundle is for; empty means every season."),
  durations: z
    .array(z.enum(PACKING_DURATIONS))
    .max(PACKING_DURATIONS.length)
    .optional()
    .describe("Trip lengths the bundle is for; empty means any length."),
  abroadOnly: z
    .boolean()
    .optional()
    .describe("Only for trips abroad, e.g. passport and travel insurance."),
  autoAdd: z
    .boolean()
    .optional()
    .describe(
      "Add the bundle automatically to every new packing list that fits its seasons, durations and abroad rule."
    ),
}

const skippedSchema = z
  .array(z.object({ name: z.string(), existingItemId: z.string() }))
  .describe("Things not added because the list already had the name.")

const changeOutputSchema = {
  list: packingListCardSchema,
  addedBundles: z.array(z.object({ id: z.string(), name: z.string() })),
  createdItemIds: z.array(z.string()),
  skipped: skippedSchema,
}

function changeResult(result: PackingChangeResult) {
  return {
    list: serializePackingList(result.list),
    addedBundles: result.addedBundles,
    createdItemIds: result.createdItemIds,
    skipped: result.skipped,
  }
}

function changeSummary(prefix: string, result: PackingChangeResult) {
  const bundles =
    result.addedBundles.length > 0
      ? ` fra ${result.addedBundles.map((bundle) => bundle.name).join(", ")}`
      : ""
  const skipped =
    result.skipped.length > 0
      ? `; ${result.skipped.length} fantes allerede`
      : ""
  return `${prefix}: ${result.createdItemIds.length} ting lagt til${bundles}${skipped}.`
}

// ─── Lists ──────────────────────────────────────────────────────

export const createPackingListTool = defineWriteTool({
  name: "create-packing-list",
  scope: "packing:write",
  title: "Create a packing list",
  description:
    "Creates a packing list for a trip. Set season, duration and abroad so the right bundles are added: every bundle marked autoAdd that fits the trip comes along automatically (turn off with applyAutoBundles false), plus the bundles you name in bundleIds and any loose items. Names that appear twice are packed once. Check list-packing-bundles first and reuse bundles instead of listing their items again. Returns the list with its items.",
  inputSchema: {
    name: nameInputSchema.describe("E.g. 'Hytta påske' or 'Sydentur juli'."),
    ...tripInputSchema,
    bundleIds: z
      .array(idSchema)
      .max(MAX_BATCH_SIZE)
      .optional()
      .describe("Bundles to add, from list-packing-bundles."),
    applyAutoBundles: z
      .boolean()
      .optional()
      .describe("Add the fitting autoAdd bundles. Defaults to true."),
    items: z
      .array(itemInputSchema)
      .max(MAX_BATCH_SIZE)
      .optional()
      .describe("Loose things that are not in any bundle."),
  },
  outputSchema: changeOutputSchema,
  annotations: CREATE_ANNOTATIONS,
  resourceType: "packing_list",
  handler: async (args, session) => {
    const result = await createPackingList(session.context, args)

    return {
      structuredContent: changeResult(result),
      summary: changeSummary(`Opprettet ${result.list.name}`, result),
      resourceId: result.list.id,
    }
  },
})

export const updatePackingListTool = defineWriteTool({
  name: "update-packing-list",
  scope: "packing:write",
  title: "Update a packing list",
  description:
    "Changes the name, trip details or notes of a packing list and leaves omitted fields as they are; null clears a field. Changing season or duration does not add or remove bundles; use add-packing-bundle-to-list for that.",
  inputSchema: {
    listId: idSchema.describe("Id from list-packing-lists."),
    name: nameInputSchema.optional(),
    ...tripInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { list: packingListCardSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "packing_list",
  handler: async (args, session) => {
    const { listId, expectedUpdatedAt, ...fields } = args
    const list = await updatePackingList(session.context, listId, {
      ...fields,
      expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
    })

    return {
      structuredContent: { list: serializePackingList(list) },
      summary: `Oppdaterte ${list.name}.`,
      resourceId: list.id,
    }
  },
})

export const duplicatePackingListTool = defineWriteTool({
  name: "duplicate-packing-list",
  scope: "packing:write",
  title: "Copy a packing list",
  description:
    "Copies a packing list with all its items, nothing packed, e.g. last year's cabin trip as the start of this year's. Returns the new list.",
  inputSchema: {
    listId: idSchema.describe("The list to copy, from list-packing-lists."),
    name: nameInputSchema
      .optional()
      .describe("Name of the copy. Defaults to '<name> (kopi)'."),
    departureOn: calendarDateInputSchema.nullable().optional(),
  },
  outputSchema: { list: packingListCardSchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "packing_list",
  handler: async (args, session) => {
    const list = await duplicatePackingList(session.context, args.listId, {
      name: args.name,
      departureOn: args.departureOn,
    })

    return {
      structuredContent: { list: serializePackingList(list) },
      summary: `Kopierte til ${list.name} med ${list.items.length} ting.`,
      resourceId: list.id,
    }
  },
})

export const deletePackingListTool = defineWriteTool({
  name: "delete-packing-list",
  scope: "packing:write",
  title: "Delete a packing list",
  description:
    "Permanently removes a packing list and its items. Bundles are not affected. Confirm with the user first; to reuse a list for a new trip, unpack it with set-packing-items-packed or copy it with duplicate-packing-list instead.",
  inputSchema: {
    listId: idSchema.describe("Id from list-packing-lists."),
  },
  outputSchema: {
    deleted: z.object({ id: z.string(), name: z.string() }),
  },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "packing_list",
  handler: async (args, session) => {
    const deleted = await deletePackingList(session.context, args.listId)

    return {
      structuredContent: { deleted },
      summary: `Slettet pakkelisten ${deleted.name}.`,
      resourceId: deleted.id,
    }
  },
})

// ─── Items ──────────────────────────────────────────────────────

export const addPackingItemsTool = defineWriteTool({
  name: "add-packing-items",
  scope: "packing:write",
  title: "Add things to a packing list",
  description: `Adds 1–${MAX_BATCH_SIZE} loose things to a packing list in one all-or-nothing call. Names already on the list (case-insensitive) are skipped and reported; set onDuplicate to "create" to add them anyway. For a group of things that belong together and recur across trips, create a bundle with create-packing-bundle instead.`,
  inputSchema: {
    listId: idSchema.describe("Id from list-packing-lists."),
    items: z.array(itemInputSchema).min(1).max(MAX_BATCH_SIZE),
    onDuplicate: z.enum(["skip", "create"]).optional(),
  },
  outputSchema: changeOutputSchema,
  annotations: CREATE_ANNOTATIONS,
  resourceType: "packing_list",
  handler: async (args, session) => {
    const result = await addPackingItems(
      session.context,
      args.listId,
      args.items,
      { onDuplicate: args.onDuplicate ?? "skip" }
    )

    return {
      structuredContent: changeResult(result),
      summary: changeSummary(result.list.name, result),
      resourceId: result.list.id,
    }
  },
})

export const updatePackingItemTool = defineWriteTool({
  name: "update-packing-item",
  scope: "packing:write",
  title: "Update a thing on a packing list",
  description:
    "Changes one item's name, quantity, notes or packed state and leaves omitted fields as they are. To tick off several at once use set-packing-items-packed.",
  inputSchema: {
    itemId: idSchema.describe("Id from get-packing-list."),
    name: nameInputSchema.optional(),
    quantity: z.number().int().min(1).max(MAX_PACKING_QUANTITY).optional(),
    notes: shortTextInputSchema,
    packed: z.boolean().optional(),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { item: packingItemSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "packing_item",
  handler: async (args, session) => {
    const { itemId, expectedUpdatedAt, ...fields } = args
    const item = await updatePackingItem(session.context, itemId, {
      ...fields,
      expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
    })

    return {
      structuredContent: {
        item: {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          packed: item.packed,
          notes: item.notes,
          bundleId: item.bundleId,
          bundleName: item.bundle?.name ?? null,
          updatedAt: timestamp(item.updatedAt),
        },
      },
      summary: `Oppdaterte ${item.name}${item.packed ? " (pakket)" : ""}.`,
      resourceId: item.id,
    }
  },
})

export const setPackingItemsPackedTool = defineWriteTool({
  name: "set-packing-items-packed",
  scope: "packing:write",
  title: "Tick things off a packing list",
  description: `Marks items as packed, or not packed. Give up to ${MAX_BATCH_SIZE} itemIds, or leave itemIds out to apply to the whole list, e.g. packed false to unpack everything before reusing the list. Every id must be on the list, or nothing changes.`,
  inputSchema: {
    listId: idSchema.describe("Id from list-packing-lists."),
    packed: z.boolean(),
    itemIds: z.array(idSchema).min(1).max(MAX_BATCH_SIZE).optional(),
  },
  outputSchema: {
    changedCount: z.number().int(),
    list: packingListCardSchema,
  },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "packing_list",
  handler: async (args, session) => {
    const result = await setPackingItemsPacked(session.context, args.listId, {
      packed: args.packed,
      itemIds: args.itemIds,
    })
    const card = serializePackingList(result.list)

    return {
      structuredContent: { changedCount: result.changedCount, list: card },
      summary: `${result.list.name}: ${card.packedCount}/${card.itemCount} pakket.`,
      resourceId: result.list.id,
    }
  },
})

export const deletePackingItemsTool = defineWriteTool({
  name: "delete-packing-items",
  scope: "packing:write",
  title: "Remove things from packing lists",
  description: `Removes 1–${MAX_BATCH_SIZE} items from their packing lists. All ids must belong to the household, or nothing is removed. To take off everything a bundle added, use remove-packing-bundle-from-list.`,
  inputSchema: {
    itemIds: z.array(idSchema).min(1).max(MAX_BATCH_SIZE),
  },
  outputSchema: { deletedCount: z.number().int() },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "packing_item",
  handler: async (args, session) => {
    const result = await deletePackingItems(session.context, args.itemIds)

    return {
      structuredContent: result,
      summary: `Fjernet ${result.deletedCount} ting.`,
      resourceId: null,
    }
  },
})

// ─── Bundles on a list ──────────────────────────────────────────

export const addPackingBundleToListTool = defineWriteTool({
  name: "add-packing-bundle-to-list",
  scope: "packing:write",
  title: "Add bundles to a packing list",
  description:
    "Copies the items of one or more bundles into a packing list, e.g. 'Treningstøy' for a trip with a gym. Things already on the list are skipped. Later changes to the bundle do not change the list.",
  inputSchema: {
    listId: idSchema.describe("Id from list-packing-lists."),
    bundleIds: z
      .array(idSchema)
      .min(1)
      .max(MAX_BATCH_SIZE)
      .describe("Ids from list-packing-bundles."),
  },
  outputSchema: changeOutputSchema,
  annotations: CREATE_ANNOTATIONS,
  resourceType: "packing_list",
  handler: async (args, session) => {
    const result = await addBundlesToList(
      session.context,
      args.listId,
      args.bundleIds
    )

    return {
      structuredContent: changeResult(result),
      summary: changeSummary(result.list.name, result),
      resourceId: result.list.id,
    }
  },
})

export const removePackingBundleFromListTool = defineWriteTool({
  name: "remove-packing-bundle-from-list",
  scope: "packing:write",
  title: "Remove a bundle from a packing list",
  description:
    "Removes the items a bundle added to a packing list. With keepPacked true, items already packed stay. The bundle itself is not changed.",
  inputSchema: {
    listId: idSchema.describe("Id from list-packing-lists."),
    bundleId: idSchema.describe("Id from get-packing-list's bundles."),
    keepPacked: z.boolean().optional(),
  },
  outputSchema: {
    deletedCount: z.number().int(),
    list: packingListCardSchema,
  },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "packing_list",
  handler: async (args, session) => {
    const result = await removeBundleFromList(
      session.context,
      args.listId,
      args.bundleId,
      { keepPacked: args.keepPacked }
    )

    return {
      structuredContent: {
        deletedCount: result.deletedCount,
        list: serializePackingList(result.list),
      },
      summary: `Fjernet ${result.deletedCount} ting fra ${result.list.name}.`,
      resourceId: result.list.id,
    }
  },
})

// ─── Bundles ────────────────────────────────────────────────────

export const createPackingBundleTool = defineWriteTool({
  name: "create-packing-bundle",
  scope: "packing:write",
  title: "Create a packing bundle",
  description:
    "Creates a reusable bundle of things that are packed together, such as 'Treningstøy' (shoes, shorts, t-shirt, water bottle), 'Vintertøy barn' or 'Utenlandsreise' (passport, travel insurance card, adapter; abroadOnly and autoAdd). Names are unique in the household. Returns the bundle.",
  inputSchema: {
    name: nameInputSchema,
    ...bundleFieldsInputSchema,
    items: z
      .array(itemInputSchema)
      .max(MAX_BATCH_SIZE)
      .optional()
      .describe("The things in the bundle, in packing order."),
  },
  outputSchema: { bundle: packingBundleSchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "packing_bundle",
  handler: async (args, session) => {
    const bundle = await createPackingBundle(session.context, args)

    return {
      structuredContent: { bundle: serializePackingBundle(bundle) },
      summary: `Opprettet pakken ${bundle.name} med ${bundle.items.length} ting.`,
      resourceId: bundle.id,
    }
  },
})

export const updatePackingBundleTool = defineWriteTool({
  name: "update-packing-bundle",
  scope: "packing:write",
  title: "Update a packing bundle",
  description:
    "Changes a bundle's name, conditions or items and leaves omitted fields as they are. items is the complete list after the call: read it with get-packing-bundle and send it back with your changes. Lists the bundle was already added to are not changed.",
  inputSchema: {
    bundleId: idSchema.describe("Id from list-packing-bundles."),
    name: nameInputSchema.optional(),
    ...bundleFieldsInputSchema,
    items: z
      .array(itemInputSchema)
      .max(MAX_BATCH_SIZE)
      .optional()
      .describe(
        "The complete list of things in the bundle. Things left out are removed. Omit to leave items unchanged."
      ),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { bundle: packingBundleSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "packing_bundle",
  handler: async (args, session) => {
    const { bundleId, expectedUpdatedAt, ...fields } = args
    const bundle = await updatePackingBundle(session.context, bundleId, {
      ...fields,
      expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
    })

    return {
      structuredContent: { bundle: serializePackingBundle(bundle) },
      summary: `Oppdaterte pakken ${bundle.name}.`,
      resourceId: bundle.id,
    }
  },
})

export const deletePackingBundleTool = defineWriteTool({
  name: "delete-packing-bundle",
  scope: "packing:write",
  title: "Delete a packing bundle",
  description:
    "Permanently removes a bundle. Items it already added to packing lists stay on them. Confirm with the user first.",
  inputSchema: {
    bundleId: idSchema.describe("Id from list-packing-bundles."),
  },
  outputSchema: {
    deleted: z.object({ id: z.string(), name: z.string() }),
  },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "packing_bundle",
  handler: async (args, session) => {
    const deleted = await deletePackingBundle(session.context, args.bundleId)

    return {
      structuredContent: { deleted },
      summary: `Slettet pakken ${deleted.name}.`,
      resourceId: deleted.id,
    }
  },
})

export const packingWriteTools = [
  createPackingListTool,
  updatePackingListTool,
  duplicatePackingListTool,
  deletePackingListTool,
  addPackingItemsTool,
  updatePackingItemTool,
  setPackingItemsPackedTool,
  deletePackingItemsTool,
  addPackingBundleToListTool,
  removePackingBundleFromListTool,
  createPackingBundleTool,
  updatePackingBundleTool,
  deletePackingBundleTool,
]
