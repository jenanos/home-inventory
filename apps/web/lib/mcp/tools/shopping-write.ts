import { z } from "zod"

import { MAX_BATCH_SIZE } from "../../application/mutations"
import {
  MAX_ALTERNATIVES_PER_ITEM,
  addProductAlternative,
  addShoppingItems,
  createShoppingList,
  setPreferredAlternative,
  setShoppingItemStatus,
  updateProductAlternative,
  updateShoppingItem,
  updateShoppingList,
} from "../../application/shopping/write"
import {
  CREATE_ANNOTATIONS,
  defineWriteTool,
  UPDATE_ANNOTATIONS,
  type McpToolDefinition,
} from "./define"
import {
  ITEM_STATUSES,
  PHASES,
  PRIORITIES,
  calendarDateInputSchema,
  expectedUpdatedAtSchema,
  idSchema,
  longTextInputSchema,
  moneyInputSchema,
  nameInputSchema,
  parseExpectedUpdatedAt,
  shortTextInputSchema,
  urlInputSchema,
} from "./shared"
import {
  productAlternativeSchema,
  serializeProductAlternative,
  serializeShoppingItem,
  serializeShoppingListSummary,
  shoppingItemSchema,
  shoppingListSummarySchema,
} from "./shopping"

/**
 * Listed literally, like every other enum in a published contract.
 * `shopping-write.test.ts` compares the list with `LIST_COLOR_PRESETS`.
 */
export const LIST_COLORS = [
  "default",
  "coral",
  "amber",
  "sage",
  "petroleum",
  "blue",
  "violet",
  "rose",
] as const

const colorInputSchema = z
  .enum(LIST_COLORS)
  .nullable()
  .optional()
  .describe("Card color preset. null or 'default' resets to the default.")

/** Optional item fields shared by add and update. `assignedTo` is web-only. */
const itemFieldsInputSchema = {
  description: longTextInputSchema,
  categoryId: idSchema
    .nullable()
    .optional()
    .describe("Id from list-shopping-categories, or null for no category."),
  priority: z.enum(PRIORITIES).optional(),
  phase: z
    .enum(PHASES)
    .nullable()
    .optional()
    .describe("When in a move the item is needed."),
  dueDate: calendarDateInputSchema.nullable().optional(),
  estimatedPrice: moneyInputSchema.nullable().optional(),
  url: urlInputSchema,
  storeName: shortTextInputSchema,
}

const alternativeFieldsInputSchema = {
  price: moneyInputSchema.nullable().optional(),
  url: urlInputSchema,
  storeName: shortTextInputSchema,
  notes: longTextInputSchema,
}

export const createShoppingListTool = defineWriteTool({
  name: "create-shopping-list",
  scope: "shopping:write",
  title: "Create a shopping list",
  description:
    "Creates a new shopping list in the household. Check list-shopping-lists first so a list is not created twice. A private list is visible only to the authenticated user. Returns the saved list.",
  inputSchema: {
    name: nameInputSchema,
    isPrivate: z
      .boolean()
      .optional()
      .describe("Make the list visible only to you. Defaults to false."),
    color: colorInputSchema,
  },
  outputSchema: { list: shoppingListSummarySchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "shopping_list",
  handler: async (args, session) => {
    const list = await createShoppingList(session.context, args)

    return {
      structuredContent: { list: serializeShoppingListSummary(list) },
      summary: `Opprettet handlelisten ${list.name}${list.isPrivate ? " (privat)" : ""}.`,
      resourceId: list.id,
    }
  },
})

export const updateShoppingListTool = defineWriteTool({
  name: "update-shopping-list",
  scope: "shopping:write",
  title: "Rename or recolor a shopping list",
  description:
    "Changes a list's name or color. Whether a list is private cannot be changed here; that is done in the app. Returns the saved list.",
  inputSchema: {
    listId: idSchema.describe("Id from list-shopping-lists."),
    name: nameInputSchema.optional(),
    color: colorInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { list: shoppingListSummarySchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "shopping_list",
  handler: async (args, session) => {
    const list = await updateShoppingList(session.context, args.listId, {
      name: args.name,
      color: args.color,
      expectedUpdatedAt: parseExpectedUpdatedAt(args.expectedUpdatedAt),
    })

    return {
      structuredContent: { list: serializeShoppingListSummary(list) },
      summary: `Oppdaterte handlelisten ${list.name}.`,
      resourceId: list.id,
    }
  },
})

export const addShoppingItemsTool = defineWriteTool({
  name: "add-shopping-items",
  scope: "shopping:write",
  title: "Add items to a shopping list",
  description: `Adds 1–${MAX_BATCH_SIZE} items to one list in a single all-or-nothing call. By default an item whose name is already on the list (case-insensitive), or repeated in the batch, is skipped and reported with the existing item's id, so a retry does not create duplicates; set onDuplicate to "create" to add it anyway. Use update-shopping-item to change an existing item.`,
  inputSchema: {
    listId: idSchema.describe("Id from list-shopping-lists."),
    items: z
      .array(
        z.object({
          name: nameInputSchema,
          ...itemFieldsInputSchema,
          alternatives: z
            .array(
              z.object({
                name: nameInputSchema,
                ...alternativeFieldsInputSchema,
              })
            )
            .max(MAX_ALTERNATIVES_PER_ITEM)
            .optional()
            .describe(
              "Product alternatives in preference order; the first becomes the preferred one."
            ),
        })
      )
      .min(1)
      .max(MAX_BATCH_SIZE),
    onDuplicate: z
      .enum(["skip", "create"])
      .optional()
      .describe(
        'What to do with a name already on the list. Defaults to "skip".'
      ),
  },
  outputSchema: {
    created: z.array(shoppingItemSchema),
    skipped: z.array(
      z.object({
        name: z.string(),
        existingItemId: z
          .string()
          .describe("The item that already has this name."),
      })
    ),
  },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "shopping_list",
  handler: async (args, session) => {
    const { created, skipped } = await addShoppingItems(
      session.context,
      args.listId,
      args.items,
      { onDuplicate: args.onDuplicate ?? "skip" }
    )

    return {
      structuredContent: {
        created: created.map((item) => serializeShoppingItem(item, true)),
        skipped,
      },
      summary:
        `La til ${created.length} vare(r)` +
        (skipped.length > 0
          ? `; hoppet over ${skipped.length} som allerede fantes.`
          : "."),
      resourceId: args.listId,
    }
  },
})

export const updateShoppingItemTool = defineWriteTool({
  name: "update-shopping-item",
  scope: "shopping:write",
  title: "Update a shopping item",
  description:
    "Changes the given fields of one item and leaves omitted fields as they are; null clears a field. To mark items purchased or skipped, use set-shopping-item-status. Returns the saved item.",
  inputSchema: {
    itemId: idSchema.describe("Id from get-shopping-list."),
    name: nameInputSchema.optional(),
    ...itemFieldsInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { item: shoppingItemSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "shopping_item",
  handler: async (args, session) => {
    const { itemId, expectedUpdatedAt, ...fields } = args
    const item = await updateShoppingItem(session.context, itemId, {
      ...fields,
      expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
    })

    return {
      structuredContent: { item: serializeShoppingItem(item, true) },
      summary: `Oppdaterte ${item.name}.`,
      resourceId: item.id,
    }
  },
})

export const setShoppingItemStatusTool = defineWriteTool({
  name: "set-shopping-item-status",
  scope: "shopping:write",
  title: "Set the status of shopping items",
  description:
    "Sets one or more items to PENDING, PURCHASED or SKIPPED. It sets an end state rather than toggling, so repeating the call is harmless; purchasedAt is recorded the first time an item becomes PURCHASED and kept on repeats. If any id is not a visible item, nothing changes.",
  inputSchema: {
    itemIds: z
      .array(idSchema)
      .min(1)
      .max(MAX_BATCH_SIZE)
      .describe("Item ids from get-shopping-list."),
    status: z.enum(ITEM_STATUSES),
  },
  outputSchema: { items: z.array(shoppingItemSchema) },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "shopping_item",
  handler: async (args, session) => {
    const items = await setShoppingItemStatus(
      session.context,
      args.itemIds,
      args.status
    )

    return {
      structuredContent: {
        items: items.map((item) => serializeShoppingItem(item, false)),
      },
      summary: `Satte ${items.length} vare(r) til ${args.status}.`,
      resourceId: items.length === 1 ? (items[0]?.id ?? null) : null,
    }
  },
})

const alternativeResultSchema = productAlternativeSchema.extend({
  itemId: z.string(),
})

export const addProductAlternativeTool = defineWriteTool({
  name: "add-product-alternative",
  scope: "shopping:write",
  title: "Add a product alternative",
  description:
    "Adds a candidate product (another model, store or price) to a shopping item, after its existing alternatives. Use set-preferred-alternative to make it the first choice. Returns the saved alternative.",
  inputSchema: {
    itemId: idSchema.describe("Id from get-shopping-list."),
    name: nameInputSchema,
    ...alternativeFieldsInputSchema,
  },
  outputSchema: { alternative: alternativeResultSchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "product_alternative",
  handler: async (args, session) => {
    const { itemId, ...fields } = args
    const { alternative } = await addProductAlternative(
      session.context,
      itemId,
      fields
    )

    return {
      structuredContent: {
        alternative: {
          ...serializeProductAlternative(alternative),
          itemId: alternative.itemId,
        },
      },
      summary: `La til alternativet ${alternative.name}.`,
      resourceId: alternative.id,
    }
  },
})

export const updateProductAlternativeTool = defineWriteTool({
  name: "update-product-alternative",
  scope: "shopping:write",
  title: "Update a product alternative",
  description:
    "Changes the given fields of one product alternative and leaves omitted fields as they are; null clears a field. Returns the saved alternative.",
  inputSchema: {
    alternativeId: idSchema.describe(
      "Id from get-shopping-list with includeAlternatives."
    ),
    name: nameInputSchema.optional(),
    ...alternativeFieldsInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { alternative: alternativeResultSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "product_alternative",
  handler: async (args, session) => {
    const { alternativeId, expectedUpdatedAt, ...fields } = args
    const { alternative } = await updateProductAlternative(
      session.context,
      alternativeId,
      {
        ...fields,
        expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
      }
    )

    return {
      structuredContent: {
        alternative: {
          ...serializeProductAlternative(alternative),
          itemId: alternative.itemId,
        },
      },
      summary: `Oppdaterte alternativet ${alternative.name}.`,
      resourceId: alternative.id,
    }
  },
})

export const setPreferredAlternativeTool = defineWriteTool({
  name: "set-preferred-alternative",
  scope: "shopping:write",
  title: "Choose the preferred product alternative",
  description:
    "Makes one alternative the item's first choice (rank 0); its price becomes the item's effective price. The others keep their relative order. Choosing the current favourite again changes nothing. Returns the item with its alternatives in the new order.",
  inputSchema: {
    itemId: idSchema.describe("Id from get-shopping-list."),
    alternativeId: idSchema.describe("Alternative belonging to that item."),
  },
  outputSchema: { item: shoppingItemSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "shopping_item",
  handler: async (args, session) => {
    const { item } = await setPreferredAlternative(
      session.context,
      args.itemId,
      args.alternativeId
    )
    const preferred = item.alternatives[0]

    return {
      structuredContent: { item: serializeShoppingItem(item, true) },
      summary: `${preferred?.name ?? "Alternativet"} er nå foretrukket for ${item.name}.`,
      resourceId: item.id,
    }
  },
})

export const shoppingWriteTools: McpToolDefinition[] = [
  createShoppingListTool,
  updateShoppingListTool,
  addShoppingItemsTool,
  updateShoppingItemTool,
  setShoppingItemStatusTool,
  addProductAlternativeTool,
  updateProductAlternativeTool,
  setPreferredAlternativeTool,
]
