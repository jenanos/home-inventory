import { z } from "zod"

import { PACKING_CATEGORIES } from "../../application/packing/categories"
import { CATEGORY_LABELS as CATEGORY_NAMES } from "../../packing-labels"
import {
  countPackingCategories,
  getPackingBundle,
  getPackingList,
  listPackingBundlesPage,
  listPackingItemNames,
  listPackingListsPage,
  listPackingPersons,
  type PackingBundleWithItems,
  type PackingListDetail,
  type PackingListSummary,
} from "../../application/packing/read"
import { quantityByDurationOf } from "../../application/packing/rules"
import {
  buildPageInfo,
  pageInfoSchema,
  paginationInputSchema,
  resolvePageRequest,
} from "../pagination"
import { notFoundError, toolSuccess } from "../result"
import { defineTool, READ_ONLY_ANNOTATIONS } from "./define"
import {
  PACKING_DURATIONS,
  PACKING_LIST_KINDS,
  PACKING_SEASONS,
  assertId,
  calendarDate,
  calendarDateOutputSchema,
  filterTextSchema,
  idSchema,
  timestamp,
  timestampSchema,
} from "./shared"

// ─── Shapes ─────────────────────────────────────────────────────

const CATEGORY_MEANINGS: Record<(typeof PACKING_CATEGORIES)[number], string> = {
  CLOTHING: "clothes, shoes and accessories such as hats, gloves, belts",
  TOILETRIES:
    "toothbrush, skin care, sunscreen, hair and make-up things, glasses and contact lenses",
  HEALTH: "medicine, first aid, plasters, insect repellent, contraception",
  ELECTRONICS: "phones, chargers, cables, adapters, headphones, cameras",
  DOCUMENTS: "passport, ID, cards, insurance, tickets, cash, wallet and keys",
  KIDS: "nappies, dummies, prams, car seats, baby gear and toys",
  FOOD: "food, snacks and drinks",
  OUTDOOR: "hiking, camping, skiing, cycling, swimming and other sports gear",
  HOME: "bedding, towels, kitchen and cleaning things for the cabin or a rental",
  LEISURE: "books, magazines, games, crafts and music",
  OTHER: "anything else",
}

export const packingCategorySchema = z
  .enum(PACKING_CATEGORIES)
  .describe(
    `What kind of thing it is: ${PACKING_CATEGORIES.map((category) => `${category} = ${CATEGORY_MEANINGS[category]}`).join("; ")}.`
  )

export function categoryName(category: (typeof PACKING_CATEGORIES)[number]) {
  return CATEGORY_NAMES[category]
}

export const packingListKindSchema = z
  .enum(PACKING_LIST_KINDS)
  .describe(
    "TEMPLATE = a reusable starting point that is never packed; TRIP = a trip being planned or packed; ARCHIVED = a finished trip kept for reference."
  )

const tripShape = {
  kind: packingListKindSchema,
  season: z.enum(PACKING_SEASONS).nullable(),
  duration: z
    .enum(PACKING_DURATIONS)
    .nullable()
    .describe(
      "DAY = day trip, WEEKEND = 1–3 nights, WEEK = 4–8 nights, LONG = more than 8 nights."
    ),
  abroad: z.boolean().describe("A trip abroad."),
  departureOn: calendarDateOutputSchema,
  notes: z.string().nullable(),
}

export const packingItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  packed: z.boolean(),
  notes: z.string().nullable(),
  category: packingCategorySchema,
  bundleId: z
    .string()
    .nullable()
    .describe("The bundle the item came from, or null for a loose item."),
  bundleName: z.string().nullable(),
  personId: z
    .string()
    .nullable()
    .describe("Who the item is for (list-packing-persons), or null if shared."),
  personName: z.string().nullable(),
  groupId: z
    .string()
    .nullable()
    .describe("The sub-list the item is in, or null."),
  groupName: z.string().nullable(),
  updatedAt: timestampSchema,
})

export const packingListCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  ...tripShape,
  itemCount: z.number().int(),
  packedCount: z.number().int(),
  persons: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        itemCount: z.number().int(),
        packedCount: z.number().int(),
      })
    )
    .describe(
      "People with things on the list, and how much of theirs is packed."
    ),
  bundles: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .describe("Bundles with items on the list."),
  groups: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        itemCount: z.number().int(),
        packedCount: z.number().int(),
        updatedAt: timestampSchema,
      })
    )
    .describe("Sub-lists on this list, in order."),
  items: z.array(packingItemSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

const packingListRowSchema = packingListCardSchema.omit({
  items: true,
  groups: true,
})

const quantityByDurationSchema = z
  .object({
    DAY: z.number().int().optional(),
    WEEKEND: z.number().int().optional(),
    WEEK: z.number().int().optional(),
    LONG: z.number().int().optional(),
  })
  .describe(
    "How many to pack for each trip length that differs from quantity, e.g. { WEEKEND: 3, WEEK: 7 }. Lengths left out use quantity."
  )

export const packingBundleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  seasons: z
    .array(z.enum(PACKING_SEASONS))
    .describe("Seasons the bundle is for; empty means every season."),
  durations: z
    .array(z.enum(PACKING_DURATIONS))
    .describe("Trip lengths the bundle is for; empty means any length."),
  abroadOnly: z.boolean().describe("Only for trips abroad."),
  autoAdd: z
    .boolean()
    .describe(
      "Added automatically to every new packing list that fits its seasons, durations and abroad rule."
    ),
  personId: z
    .string()
    .nullable()
    .describe(
      "Whose bundle it is: its things go to this person when the bundle is added without a personId. Null: shared."
    ),
  personName: z.string().nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      quantity: z.number().int(),
      quantityByDuration: quantityByDurationSchema,
      notes: z.string().nullable(),
      category: packingCategorySchema,
    })
  ),
  updatedAt: timestampSchema,
})

// ─── Serialization ──────────────────────────────────────────────

function bundlesOnList(
  items: Array<{ bundle: { id: string; name: string } | null }>
) {
  const seen = new Map<string, string>()
  for (const item of items) {
    if (item.bundle && !seen.has(item.bundle.id)) {
      seen.set(item.bundle.id, item.bundle.name)
    }
  }
  return [...seen].map(([id, name]) => ({ id, name }))
}

type PersonItem = {
  packed: boolean
  person: { id: string; name: string } | null
}

function personsOnList(items: PersonItem[]) {
  const persons = new Map<
    string,
    { id: string; name: string; itemCount: number; packedCount: number }
  >()
  for (const item of items) {
    if (!item.person) continue
    const entry = persons.get(item.person.id) ?? {
      ...item.person,
      itemCount: 0,
      packedCount: 0,
    }
    entry.itemCount += 1
    if (item.packed) entry.packedCount += 1
    persons.set(item.person.id, entry)
  }
  return [...persons.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "nb-NO")
  )
}

function serializeTrip(list: PackingListSummary | PackingListDetail) {
  return {
    kind: list.kind,
    season: list.season,
    duration: list.duration,
    abroad: list.abroad,
    departureOn: calendarDate(list.departureOn),
    notes: list.notes,
  }
}

/**
 * The list card. With `personId` only that person's things are listed
 * (`null`: the shared ones), and with `category` only that category's; the
 * counts and people always cover the list.
 */
export function serializePackingList(
  list: PackingListDetail,
  {
    personId,
    category,
  }: {
    personId?: string | null
    category?: (typeof PACKING_CATEGORIES)[number]
  } = {}
): z.infer<typeof packingListCardSchema> {
  const items = list.items.filter(
    (item) =>
      (personId === undefined || item.personId === personId) &&
      (category === undefined || item.category === category)
  )
  return {
    id: list.id,
    name: list.name,
    ...serializeTrip(list),
    itemCount: list.items.length,
    packedCount: list.items.filter((item) => item.packed).length,
    persons: personsOnList(list.items),
    bundles: bundlesOnList(list.items),
    groups: list.groups.map((group) => {
      const own = list.items.filter((item) => item.groupId === group.id)
      return {
        id: group.id,
        name: group.name,
        itemCount: own.length,
        packedCount: own.filter((item) => item.packed).length,
        updatedAt: timestamp(group.updatedAt),
      }
    }),
    items: items.map(serializePackingItem),
    createdAt: timestamp(list.createdAt),
    updatedAt: timestamp(list.updatedAt),
  }
}

export function serializePackingItem(
  item: PackingListDetail["items"][number]
): z.infer<typeof packingItemSchema> {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    packed: item.packed,
    notes: item.notes,
    category: item.category,
    bundleId: item.bundleId,
    bundleName: item.bundle?.name ?? null,
    personId: item.personId,
    personName: item.person?.name ?? null,
    groupId: item.groupId,
    groupName: item.group?.name ?? null,
    updatedAt: timestamp(item.updatedAt),
  }
}

export function serializePackingBundle(
  bundle: PackingBundleWithItems
): z.infer<typeof packingBundleSchema> {
  return {
    id: bundle.id,
    name: bundle.name,
    description: bundle.description,
    seasons: bundle.seasons,
    durations: bundle.durations,
    abroadOnly: bundle.abroadOnly,
    autoAdd: bundle.autoAdd,
    personId: bundle.personId,
    personName: bundle.person?.name ?? null,
    items: bundle.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      quantityByDuration: quantityByDurationOf(item),
      notes: item.notes,
      category: item.category,
    })),
    updatedAt: timestamp(bundle.updatedAt),
  }
}

// ─── Tools ──────────────────────────────────────────────────────

export const listPackingListsTool = defineTool({
  name: "list-packing-lists",
  scope: "packing:read",
  title: "List packing lists",
  description:
    "Lists the household's packing lists, upcoming departures first, with the kind (TEMPLATE, TRIP or ARCHIVED), the trip's season, duration and abroad flag and how much is packed. get-packing-list returns the items.",
  inputSchema: {
    kind: z
      .enum(PACKING_LIST_KINDS)
      .optional()
      .describe(
        "Only templates, trips or finished trips. Omit for every kind."
      ),
    query: filterTextSchema
      .optional()
      .describe("Case-insensitive substring match on the name or notes."),
    season: z.enum(PACKING_SEASONS).optional(),
    duration: z.enum(PACKING_DURATIONS).optional(),
    abroad: z.boolean().optional(),
    personId: idSchema
      .optional()
      .describe("Only lists with something packed for this person."),
    ...paginationInputSchema,
  },
  outputSchema: {
    lists: z.array(packingListRowSchema),
    pageInfo: pageInfoSchema,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    const page = resolvePageRequest(args)
    const { totalCount, lists } = await listPackingListsPage(session.context, {
      ...page,
      kind: args.kind,
      query: args.query,
      season: args.season,
      duration: args.duration,
      abroad: args.abroad,
      personId: args.personId,
    })
    const rows = lists.map((list) => ({
      id: list.id,
      name: list.name,
      ...serializeTrip(list),
      itemCount: list.items.length,
      packedCount: list.items.filter((item) => item.packed).length,
      persons: personsOnList(list.items),
      bundles: bundlesOnList(list.items),
      createdAt: timestamp(list.createdAt),
      updatedAt: timestamp(list.updatedAt),
    }))

    return toolSuccess(
      { lists: rows, pageInfo: buildPageInfo(page, rows.length, totalCount) },
      `Fant ${totalCount} pakkeliste(r).`
    )
  },
})

export const getPackingListTool = defineTool({
  name: "get-packing-list",
  scope: "packing:read",
  title: "Get a packing list",
  description:
    "Returns one packing list with every item, whether it is packed, its category, the bundle it came from, who it is for and its sub-list.",
  inputSchema: {
    listId: idSchema.describe("Id from list-packing-lists."),
    personId: idSchema
      .nullable()
      .optional()
      .describe(
        "Only this person's things (from list-packing-persons), or null for the shared ones. Omit for everything."
      ),
    category: z
      .enum(PACKING_CATEGORIES)
      .optional()
      .describe("Only the things in this category."),
  },
  outputSchema: { list: packingListCardSchema },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    assertId(args.listId, "listId")
    const list = await getPackingList(session.context, args.listId)
    if (!list) return notFoundError("pakkeliste")

    const card = serializePackingList(list, {
      personId: args.personId,
      category: args.category,
    })
    return toolSuccess(
      { list: card },
      `${list.name}: ${card.packedCount}/${card.itemCount} pakket.`
    )
  },
})

export const listPackingBundlesTool = defineTool({
  name: "list-packing-bundles",
  scope: "packing:read",
  title: "List packing bundles",
  description:
    "Lists the household's reusable bundles: groups of things packed together, such as 'Treningstøy' or 'Vintertøy barn', with their items and the seasons, trip lengths and abroad rule they are for. season and duration return the bundles that apply, including those without a limit.",
  inputSchema: {
    query: filterTextSchema
      .optional()
      .describe("Substring of the name, description or an item's name."),
    season: z.enum(PACKING_SEASONS).optional(),
    duration: z.enum(PACKING_DURATIONS).optional(),
    abroadOnly: z.boolean().optional(),
    autoAdd: z.boolean().optional(),
    ...paginationInputSchema,
  },
  outputSchema: {
    bundles: z.array(packingBundleSchema),
    pageInfo: pageInfoSchema,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    const page = resolvePageRequest(args)
    const { totalCount, bundles } = await listPackingBundlesPage(
      session.context,
      {
        ...page,
        query: args.query,
        season: args.season,
        duration: args.duration,
        abroadOnly: args.abroadOnly,
        autoAdd: args.autoAdd,
      }
    )
    const rows = bundles.map(serializePackingBundle)

    return toolSuccess(
      {
        bundles: rows,
        pageInfo: buildPageInfo(page, rows.length, totalCount),
      },
      `Fant ${totalCount} pakke(r)${rows.length > 0 ? `: ${rows.map((bundle) => bundle.name).join(", ")}` : ""}.`
    )
  },
})

export const getPackingBundleTool = defineTool({
  name: "get-packing-bundle",
  scope: "packing:read",
  title: "Get a packing bundle",
  description: "Returns one bundle with its items and conditions.",
  inputSchema: {
    bundleId: idSchema.describe("Id from list-packing-bundles."),
  },
  outputSchema: { bundle: packingBundleSchema },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    assertId(args.bundleId, "bundleId")
    const bundle = await getPackingBundle(session.context, args.bundleId)
    if (!bundle) return notFoundError("pakke")

    return toolSuccess(
      { bundle: serializePackingBundle(bundle) },
      `${bundle.name}: ${bundle.items.length} ting.`
    )
  },
})

export const packingPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: timestampSchema,
})

export const listPackingPersonsTool = defineTool({
  name: "list-packing-persons",
  scope: "packing:read",
  title: "List people to pack for",
  description:
    "Lists the people the household packs for: family members, including children who do not use the app. Items and bundles on a packing list can be assigned to one of them.",
  inputSchema: {},
  outputSchema: { persons: z.array(packingPersonSchema) },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (_args, session) => {
    const persons = await listPackingPersons(session.context)

    return toolSuccess(
      {
        persons: persons.map((person) => ({
          id: person.id,
          name: person.name,
          updatedAt: timestamp(person.updatedAt),
        })),
      },
      persons.length === 0
        ? "Ingen personer lagt inn."
        : `Personer: ${persons.map((person) => person.name).join(", ")}.`
    )
  },
})

export const listPackingCategoriesTool = defineTool({
  name: "list-packing-categories",
  scope: "packing:read",
  title: "List packing categories",
  description:
    "Lists the categories every thing on a packing list and in a bundle has, in the order the list page shows them, with the Norwegian name and how many things on lists and in bundles have each. The set is fixed. To check or correct categories, continue with list-packing-item-names and set-packing-categories.",
  inputSchema: {},
  outputSchema: {
    categories: z.array(
      z.object({
        category: packingCategorySchema,
        name: z.string().describe("The Norwegian name shown on the page."),
        meaning: z.string(),
        listItemCount: z.number().int(),
        bundleItemCount: z.number().int(),
      })
    ),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (_args, session) => {
    const counts = await countPackingCategories(session.context)
    const categories = PACKING_CATEGORIES.map((category) => ({
      category,
      name: CATEGORY_NAMES[category],
      meaning: CATEGORY_MEANINGS[category],
      listItemCount: counts.get(category)?.listItemCount ?? 0,
      bundleItemCount: counts.get(category)?.bundleItemCount ?? 0,
    }))
    const other = counts.get("OTHER")

    return toolSuccess(
      { categories },
      `${categories.length} kategorier. I «Annet»: ${other?.listItemCount ?? 0} ting på lister, ${other?.bundleItemCount ?? 0} i pakker.`
    )
  },
})

export const listPackingItemNamesTool = defineTool({
  name: "list-packing-item-names",
  scope: "packing:read",
  title: "List things by category",
  description:
    "Lists every distinct thing on the household's packing lists and in its bundles, once per name and category, in category order: the overview for checking categories. Each row says how many list items and bundle items have that name and category and which bundles it is in. A name in two categories appears twice. Fix categories with set-packing-categories, preferably by name so every copy changes at once. Start with category OTHER to find what was not recognised.",
  inputSchema: {
    category: z
      .enum(PACKING_CATEGORIES)
      .optional()
      .describe("Only this category, e.g. OTHER for the unrecognised ones."),
    query: filterTextSchema
      .optional()
      .describe("Case-insensitive substring of the name."),
    ...paginationInputSchema,
  },
  outputSchema: {
    names: z.array(
      z.object({
        name: z.string(),
        category: packingCategorySchema,
        listItemCount: z.number().int(),
        bundleItemCount: z.number().int(),
        bundles: z.array(z.string()).describe("Bundles it is in, by name."),
      })
    ),
    pageInfo: pageInfoSchema,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    const page = resolvePageRequest(args)
    const all = await listPackingItemNames(session.context, {
      category: args.category,
      query: args.query,
    })
    const names = all.slice(page.offset, page.offset + page.limit)

    return toolSuccess(
      { names, pageInfo: buildPageInfo(page, names.length, all.length) },
      `Fant ${all.length} navn${args.category ? ` i «${CATEGORY_NAMES[args.category]}»` : ""}.`
    )
  },
})

export const packingTools = [
  listPackingListsTool,
  getPackingListTool,
  listPackingBundlesTool,
  getPackingBundleTool,
  listPackingPersonsTool,
  listPackingCategoriesTool,
  listPackingItemNamesTool,
]
