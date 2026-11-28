import { z } from "zod"

import { MAX_BATCH_SIZE } from "../../application/mutations"
import {
  MAX_PACKING_QUANTITY,
  addBundlesToList,
  addPackingItems,
  createPackingBundle,
  createPackingGroup,
  createPackingList,
  createPackingPerson,
  deletePackingBundle,
  deletePackingGroup,
  deletePackingPerson,
  deletePackingItems,
  deletePackingList,
  duplicatePackingList,
  removeBundleFromList,
  setPackingCategories,
  setPackingItemsPacked,
  syncBundleToTemplates,
  updatePackingBundle,
  updatePackingGroup,
  updatePackingItem,
  updatePackingList,
  updatePackingPerson,
  type PackingChangeResult,
} from "../../application/packing/write"
import {
  CREATE_ANNOTATIONS,
  DELETE_ANNOTATIONS,
  defineWriteTool,
  UPDATE_ANNOTATIONS,
} from "./define"
import {
  categoryName,
  packingBundleSchema,
  packingCategorySchema,
  packingItemSchema,
  packingListCardSchema,
  packingListKindSchema,
  packingPersonSchema,
  serializePackingBundle,
  serializePackingItem,
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
  timestampSchema,
} from "./shared"

const tripInputSchema = {
  kind: packingListKindSchema.optional(),
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
  category: packingCategorySchema
    .optional()
    .describe(
      "What kind of thing it is. Omit to have it guessed from the name (OTHER when nothing matches)."
    ),
})

const personIdInputSchema = idSchema
  .nullable()
  .optional()
  .describe(
    "Who the thing is for, from list-packing-persons (create missing people with create-packing-person). Omit or null for shared things."
  )

/** A thing on a list: a bundle item, plus who it is for. */
const listItemInputSchema = itemInputSchema.extend({
  personId: personIdInputSchema,
})

const groupIdInputSchema = idSchema
  .nullable()
  .optional()
  .describe(
    "A sub-list on the same list (get-packing-list's groups). Omit or null for none."
  )

const quantityInputSchema = z.number().int().min(1).max(MAX_PACKING_QUANTITY)

/** A thing in a bundle, with numbers per trip length. */
const bundleItemInputSchema = itemInputSchema.extend({
  quantity: quantityInputSchema
    .optional()
    .describe(
      "How many to pack when the trip's length is not set or has no own number. Defaults to 1."
    ),
  quantityByDuration: z
    .object({
      DAY: quantityInputSchema.nullable().optional(),
      WEEKEND: quantityInputSchema.nullable().optional(),
      WEEK: quantityInputSchema.nullable().optional(),
      LONG: quantityInputSchema.nullable().optional(),
    })
    .optional()
    .describe(
      "How many for each trip length, e.g. underwear { WEEKEND: 3, WEEK: 7 }. Lengths left out use quantity. Used when the bundle is added to a list."
    ),
})

/** On update the id keeps a renamed thing linked to the lists it is on. */
const bundleItemUpdateInputSchema = bundleItemInputSchema.extend({
  id: idSchema
    .optional()
    .describe(
      "The item's id from get-packing-bundle. Send it for every existing item, so renames keep their link to templates; items without an id match by name."
    ),
  category: packingCategorySchema
    .optional()
    .describe(
      "What kind of thing it is. Omit to keep an existing item's category, or to guess one for a new item. A changed category also goes to the list items copied from it that still had the old one."
    ),
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
  personId: idSchema
    .nullable()
    .optional()
    .describe(
      "Whose bundle it is, from list-packing-persons, e.g. Astrid for 'Astrids toalettsaker'. Its things then go to that person whenever the bundle is added without a personId. null: shared."
    ),
}

const skippedSchema = z
  .array(z.object({ name: z.string(), existingItemId: z.string() }))
  .describe("Things not added because the list already had the name.")

const changeOutputSchema = {
  list: packingListCardSchema,
  addedBundles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      personId: z.string().nullable(),
    })
  ),
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
    "Creates a packing list: a trip (kind TRIP, the default) or a reusable template (kind TEMPLATE). To start a trip from an existing template, use duplicate-packing-list instead. Set season, duration and abroad so the right bundles are added with the right numbers: every bundle marked autoAdd that fits the trip comes along automatically (turn off with applyAutoBundles false), plus the bundles you name in bundleIds, the bundles for a person in bundles, loose items and sub-lists in groups. A bundle with its own person goes to that person. The same thing for the same person is packed once; when packing for a family, give each person their own copy of a bundle. Check list-packing-bundles first and reuse bundles instead of listing their items again. Returns the list with its items.",
  inputSchema: {
    name: nameInputSchema.describe("E.g. 'Hytta påske' or 'Sydentur juli'."),
    ...tripInputSchema,
    bundleIds: z
      .array(idSchema)
      .max(MAX_BATCH_SIZE)
      .optional()
      .describe(
        "Bundles to add, from list-packing-bundles: for the bundle's own person if it has one, otherwise as shared things."
      ),
    bundles: z
      .array(
        z.object({
          bundleId: idSchema,
          personId: idSchema
            .nullable()
            .optional()
            .describe(
              "Who the copy is for; null for shared; omit for the bundle's own person."
            ),
        })
      )
      .max(MAX_BATCH_SIZE)
      .optional()
      .describe(
        "Bundles to add for a person, e.g. 'Vintertøy barn' once for each child. The same bundle may appear once per person."
      ),
    applyAutoBundles: z
      .boolean()
      .optional()
      .describe("Add the fitting autoAdd bundles. Defaults to true."),
    items: z
      .array(listItemInputSchema)
      .max(MAX_BATCH_SIZE)
      .optional()
      .describe("Loose things that are not in any bundle."),
    groups: z
      .array(
        z.object({
          name: nameInputSchema.describe(
            "E.g. 'Til bilen' or 'Kjøpe før avreise'."
          ),
          items: z.array(listItemInputSchema).max(MAX_BATCH_SIZE).optional(),
        })
      )
      .max(20)
      .optional()
      .describe(
        "Sub-lists for things that belong together on this trip only. For a group that recurs across trips, create a bundle instead."
      ),
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
    "Changes the name, kind, trip details or notes of a packing list and leaves omitted fields as they are; null clears a field. Set kind ARCHIVED when a trip is over, and TRIP to reopen it. A new duration updates the numbers of bundle things that still have the number the bundle gave (not those changed by hand or already packed). Changing season or duration does not add or remove bundles; use add-packing-bundle-to-list for that.",
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
    "Copies a packing list with its sub-lists and items, nothing packed. Use it to start a trip from a template (kind TRIP, with the trip's name, departureOn, season, duration and abroad), to save a trip as a template (kind TEMPLATE), or to reuse last year's trip. A different duration gives the bundle things the number for the new length. Returns the new list.",
  inputSchema: {
    listId: idSchema.describe("The list to copy, from list-packing-lists."),
    name: nameInputSchema
      .optional()
      .describe(
        "Name of the copy. Defaults to the source's name, with ' (kopi)' when the kind stays the same."
      ),
    kind: packingListKindSchema
      .optional()
      .describe(
        "Kind of the copy. Defaults to the source's kind, or TRIP when copying an ARCHIVED trip."
      ),
    departureOn: calendarDateInputSchema.nullable().optional(),
    season: z.enum(PACKING_SEASONS).nullable().optional(),
    duration: z
      .enum(PACKING_DURATIONS)
      .nullable()
      .optional()
      .describe("The new trip's length. Omit to copy the source's."),
    abroad: z.boolean().optional(),
  },
  outputSchema: { list: packingListCardSchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "packing_list",
  handler: async (args, session) => {
    const { listId, ...options } = args
    const list = await duplicatePackingList(session.context, listId, options)

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
  description: `Adds 1–${MAX_BATCH_SIZE} loose things to a packing list in one all-or-nothing call. A name the same person (or nobody) already has on the list, case-insensitive, is skipped and reported; set onDuplicate to "create" to add them anyway. For a group of things that belong together and recur across trips, create a bundle with create-packing-bundle instead.`,
  inputSchema: {
    listId: idSchema.describe("Id from list-packing-lists."),
    items: z
      .array(listItemInputSchema.extend({ groupId: groupIdInputSchema }))
      .min(1)
      .max(MAX_BATCH_SIZE),
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
    "Changes one item's name, quantity, notes, category, packed state, person or sub-list and leaves omitted fields as they are. To tick off several at once use set-packing-items-packed; to set many categories at once use set-packing-categories.",
  inputSchema: {
    itemId: idSchema.describe("Id from get-packing-list."),
    name: nameInputSchema.optional(),
    quantity: z.number().int().min(1).max(MAX_PACKING_QUANTITY).optional(),
    notes: shortTextInputSchema,
    category: packingCategorySchema
      .optional()
      .describe("Change the category. Omit to leave as is."),
    packed: z.boolean().optional(),
    personId: idSchema
      .nullable()
      .optional()
      .describe(
        "Assign to a person, or null to make it shared. Omit to leave as is."
      ),
    groupId: idSchema
      .nullable()
      .optional()
      .describe(
        "Move into a sub-list on the same list, or null to take it out. Omit to leave as is."
      ),
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
      structuredContent: { item: serializePackingItem(item) },
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
    personId: idSchema
      .nullable()
      .optional()
      .describe(
        "With no itemIds: only this person's things, or null for the shared ones."
      ),
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
      personId: args.personId,
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
    "Copies the items of one or more bundles into a packing list, e.g. 'Treningstøy' for a trip with a gym, with the numbers for the list's duration. Things already on the list are skipped. Later changes to the bundle do not change the list; for templates use sync-packing-bundle-to-templates.",
  inputSchema: {
    listId: idSchema.describe("Id from list-packing-lists."),
    bundleIds: z
      .array(idSchema)
      .min(1)
      .max(MAX_BATCH_SIZE)
      .describe("Ids from list-packing-bundles."),
    personId: idSchema
      .nullable()
      .optional()
      .describe(
        "Copy the bundles' things for this person, e.g. 'Vintertøy barn' for one child; call once per person. null for shared things. Omit to give each bundle's things to its own person (shared when it has none)."
      ),
  },
  outputSchema: changeOutputSchema,
  annotations: CREATE_ANNOTATIONS,
  resourceType: "packing_list",
  handler: async (args, session) => {
    const result = await addBundlesToList(
      session.context,
      args.listId,
      args.bundleIds,
      { personId: args.personId }
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
    personId: idSchema
      .nullable()
      .optional()
      .describe(
        "Only remove the copy for this person, or null for the shared copy. Omit to remove it for everyone."
      ),
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
      { keepPacked: args.keepPacked, personId: args.personId }
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
    "Creates a reusable bundle of things that are packed together, such as 'Treningstøy' (shoes, shorts, t-shirt, water bottle), 'Vintertøy barn' or 'Utenlandsreise' (passport, travel insurance card, adapter; abroadOnly and autoAdd). Set personId for one person's own bundle ('Astrids toalettsaker'), and quantityByDuration for things whose number depends on the trip's length. Names are unique in the household. Returns the bundle.",
  inputSchema: {
    name: nameInputSchema,
    ...bundleFieldsInputSchema,
    items: z
      .array(bundleItemInputSchema)
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
    "Changes a bundle's name, conditions, person or items and leaves omitted fields as they are. items is the complete list after the call: read it with get-packing-bundle and send it back with your changes, keeping each item's id. Lists the bundle was already added to are not changed; afterwards, offer to update the templates with sync-packing-bundle-to-templates.",
  inputSchema: {
    bundleId: idSchema.describe("Id from list-packing-bundles."),
    name: nameInputSchema.optional(),
    ...bundleFieldsInputSchema,
    items: z
      .array(bundleItemUpdateInputSchema)
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

export const syncPackingBundleToTemplatesTool = defineWriteTool({
  name: "sync-packing-bundle-to-templates",
  scope: "packing:write",
  title: "Update templates from a bundle",
  description:
    "Brings the templates (kind TEMPLATE) that use a bundle up to date with it: new things are added, changed names, notes, categories and numbers are copied (for the template's duration) and things taken out of the bundle are removed, for each person's copy. Trips and finished trips are never changed. Use dryRun first to show the user what would change.",
  inputSchema: {
    bundleId: idSchema.describe("Id from list-packing-bundles."),
    listIds: z
      .array(idSchema)
      .min(1)
      .max(MAX_BATCH_SIZE)
      .optional()
      .describe("Only these templates. Omit for every template using it."),
    dryRun: z
      .boolean()
      .optional()
      .describe("Preview only: compute the changes, then discard them."),
  },
  outputSchema: {
    bundle: z.object({ id: z.string(), name: z.string() }),
    lists: z.array(
      z.object({
        listId: z.string(),
        name: z.string(),
        added: z.number().int(),
        updated: z.number().int(),
        removed: z.number().int(),
      })
    ),
    dryRun: z.boolean(),
  },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "packing_bundle",
  handler: async (args, session) => {
    const result = await syncBundleToTemplates(session.context, args.bundleId, {
      listIds: args.listIds,
      dryRun: args.dryRun,
    })
    const changes = result.lists
      .map(
        (list) =>
          `${list.name} (+${list.added}, ~${list.updated}, −${list.removed})`
      )
      .join(", ")
    const text =
      result.lists.length === 0
        ? "Ingen maler bruker pakken."
        : `${result.lists.length} mal(er): ${changes}.`

    return {
      structuredContent: result,
      summary: `${result.dryRun ? "Forhåndsvisning, ikke lagret: " : ""}${result.bundle.name}: ${text}`,
      resourceId: result.bundle.id,
      dryRun: result.dryRun,
    }
  },
})

// ─── Categories ─────────────────────────────────────────────────

export const setPackingCategoriesTool = defineWriteTool({
  name: "set-packing-categories",
  scope: "packing:write",
  title: "Set categories of packing things",
  description: `Sets the category of things on packing lists and in bundles, in one all-or-nothing call with up to ${MAX_BATCH_SIZE} entries of each kind. names is usually best: every thing with that name (case-insensitive) on every list and in every bundle gets the category, e.g. { name: 'Ullsokker', category: 'CLOTHING' }. bundleItems sets one thing in a bundle; the list items copied from it follow unless their category was changed on the list. items sets single things on a list, e.g. an exception to a name. Entries by id are applied after the names. Find what to fix with list-packing-item-names (category OTHER for what was not recognised). Categories only sort the list; nothing is packed or unpacked.`,
  inputSchema: {
    names: z
      .array(
        z.object({ name: nameInputSchema, category: packingCategorySchema })
      )
      .max(MAX_BATCH_SIZE)
      .optional()
      .describe("By name, from list-packing-item-names."),
    bundleItems: z
      .array(
        z.object({
          bundleItemId: idSchema.describe("Item id from get-packing-bundle."),
          category: packingCategorySchema,
        })
      )
      .max(MAX_BATCH_SIZE)
      .optional(),
    items: z
      .array(
        z.object({
          itemId: idSchema.describe("Item id from get-packing-list."),
          category: packingCategorySchema,
        })
      )
      .max(MAX_BATCH_SIZE)
      .optional(),
  },
  outputSchema: {
    itemCount: z
      .number()
      .int()
      .describe("Things on lists whose category changed."),
    bundleItemCount: z
      .number()
      .int()
      .describe("Things in bundles whose category changed."),
    unmatchedNames: z
      .array(z.string())
      .describe(
        "Names no thing in the household has; nothing was changed for them."
      ),
  },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "packing_item",
  handler: async (args, session) => {
    const result = await setPackingCategories(session.context, args)
    const single =
      args.names?.length === 1 &&
      !args.items?.length &&
      !args.bundleItems?.length
        ? ` (${args.names[0]!.name} → ${categoryName(args.names[0]!.category)})`
        : ""
    const unmatched =
      result.unmatchedNames.length > 0
        ? ` Fant ikke: ${result.unmatchedNames.join(", ")}.`
        : ""

    return {
      structuredContent: result,
      summary: `Endret kategori på ${result.itemCount} ting på lister og ${result.bundleItemCount} i pakker${single}.${unmatched}`,
      resourceId: null,
    }
  },
})

// ─── Sub-lists ──────────────────────────────────────────────────

const groupSchema = z.object({
  id: z.string(),
  listId: z.string(),
  name: z.string(),
  updatedAt: timestampSchema,
})

export const createPackingGroupTool = defineWriteTool({
  name: "create-packing-group",
  scope: "packing:write",
  title: "Add a sub-list to a packing list",
  description:
    "Adds a sub-list to a packing list, e.g. 'Til bilen' or 'Kjøpe før avreise', with the things in it: things for this trip that belong together without being a reusable bundle. Names are unique on the list. Add more things to it with add-packing-items and groupId.",
  inputSchema: {
    listId: idSchema.describe("Id from list-packing-lists."),
    name: nameInputSchema,
    items: z.array(listItemInputSchema).max(MAX_BATCH_SIZE).optional(),
  },
  outputSchema: { ...changeOutputSchema, groupId: z.string() },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "packing_list",
  handler: async (args, session) => {
    const result = await createPackingGroup(session.context, args.listId, {
      name: args.name,
      items: args.items,
    })

    return {
      structuredContent: { ...changeResult(result), groupId: result.groupId },
      summary: changeSummary(`${result.list.name} · ${args.name}`, result),
      resourceId: result.list.id,
    }
  },
})

export const updatePackingGroupTool = defineWriteTool({
  name: "update-packing-group",
  scope: "packing:write",
  title: "Rename a sub-list",
  description: "Renames a sub-list on a packing list.",
  inputSchema: {
    groupId: idSchema.describe("Id from get-packing-list's groups."),
    name: nameInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { group: groupSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "packing_group",
  handler: async (args, session) => {
    const group = await updatePackingGroup(session.context, args.groupId, {
      name: args.name,
      expectedUpdatedAt: parseExpectedUpdatedAt(args.expectedUpdatedAt),
    })

    return {
      structuredContent: {
        group: {
          id: group.id,
          listId: group.listId,
          name: group.name,
          updatedAt: timestamp(group.updatedAt),
        },
      },
      summary: `Endret navnet til ${group.name}.`,
      resourceId: group.id,
    }
  },
})

export const deletePackingGroupTool = defineWriteTool({
  name: "delete-packing-group",
  scope: "packing:write",
  title: "Delete a sub-list",
  description:
    "Removes a sub-list and the things in it. With keepItems true only the sub-list goes and its things stay on the list. Confirm with the user first.",
  inputSchema: {
    groupId: idSchema.describe("Id from get-packing-list's groups."),
    keepItems: z.boolean().optional(),
  },
  outputSchema: {
    deleted: z.object({
      id: z.string(),
      name: z.string(),
      listId: z.string(),
      deletedItemCount: z.number().int(),
    }),
  },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "packing_group",
  handler: async (args, session) => {
    const deleted = await deletePackingGroup(session.context, args.groupId, {
      keepItems: args.keepItems,
    })

    return {
      structuredContent: { deleted },
      summary: `Slettet underlisten ${deleted.name}${deleted.deletedItemCount > 0 ? ` med ${deleted.deletedItemCount} ting` : ""}.`,
      resourceId: deleted.id,
    }
  },
})

// ─── People ─────────────────────────────────────────────────────

function serializePerson(person: {
  id: string
  name: string
  updatedAt: Date
}) {
  return {
    id: person.id,
    name: person.name,
    updatedAt: timestamp(person.updatedAt),
  }
}

export const createPackingPersonTool = defineWriteTool({
  name: "create-packing-person",
  scope: "packing:write",
  title: "Add a person to pack for",
  description:
    "Adds someone the household packs for, e.g. a child who does not use the app. Names are unique in the household; check list-packing-persons first. Assign things to them with personId.",
  inputSchema: { name: nameInputSchema.describe("E.g. 'Ola' or 'Mamma'.") },
  outputSchema: { person: packingPersonSchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "packing_person",
  handler: async (args, session) => {
    const person = await createPackingPerson(session.context, args)

    return {
      structuredContent: { person: serializePerson(person) },
      summary: `La til ${person.name}.`,
      resourceId: person.id,
    }
  },
})

export const updatePackingPersonTool = defineWriteTool({
  name: "update-packing-person",
  scope: "packing:write",
  title: "Rename a person to pack for",
  description: "Renames a person. Their things on every list follow along.",
  inputSchema: {
    personId: idSchema.describe("Id from list-packing-persons."),
    name: nameInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { person: packingPersonSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "packing_person",
  handler: async (args, session) => {
    const person = await updatePackingPerson(session.context, args.personId, {
      name: args.name,
      expectedUpdatedAt: parseExpectedUpdatedAt(args.expectedUpdatedAt),
    })

    return {
      structuredContent: { person: serializePerson(person) },
      summary: `Endret navnet til ${person.name}.`,
      resourceId: person.id,
    }
  },
})

export const deletePackingPersonTool = defineWriteTool({
  name: "delete-packing-person",
  scope: "packing:write",
  title: "Remove a person to pack for",
  description:
    "Removes a person. Their things stay on the lists as shared things. Confirm with the user first.",
  inputSchema: {
    personId: idSchema.describe("Id from list-packing-persons."),
  },
  outputSchema: {
    deleted: z.object({ id: z.string(), name: z.string() }),
  },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "packing_person",
  handler: async (args, session) => {
    const deleted = await deletePackingPerson(session.context, args.personId)

    return {
      structuredContent: { deleted },
      summary: `Fjernet ${deleted.name}.`,
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
  syncPackingBundleToTemplatesTool,
  setPackingCategoriesTool,
  createPackingGroupTool,
  updatePackingGroupTool,
  deletePackingGroupTool,
  createPackingPersonTool,
  updatePackingPersonTool,
  deletePackingPersonTool,
]
