import { z } from "zod"

import {
  getPackingBundle,
  getPackingList,
  listPackingBundlesPage,
  listPackingListsPage,
  type PackingBundleWithItems,
  type PackingListDetail,
  type PackingListSummary,
} from "../../application/packing/read"
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

const tripShape = {
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
  bundleId: z
    .string()
    .nullable()
    .describe("The bundle the item came from, or null for a loose item."),
  bundleName: z.string().nullable(),
  updatedAt: timestampSchema,
})

export const packingListCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  ...tripShape,
  itemCount: z.number().int(),
  packedCount: z.number().int(),
  bundles: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .describe("Bundles with items on the list."),
  items: z.array(packingItemSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

const packingListRowSchema = packingListCardSchema.omit({ items: true })

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
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      quantity: z.number().int(),
      notes: z.string().nullable(),
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

function serializeTrip(list: PackingListSummary | PackingListDetail) {
  return {
    season: list.season,
    duration: list.duration,
    abroad: list.abroad,
    departureOn: calendarDate(list.departureOn),
    notes: list.notes,
  }
}

export function serializePackingList(
  list: PackingListDetail
): z.infer<typeof packingListCardSchema> {
  return {
    id: list.id,
    name: list.name,
    ...serializeTrip(list),
    itemCount: list.items.length,
    packedCount: list.items.filter((item) => item.packed).length,
    bundles: bundlesOnList(list.items),
    items: list.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      packed: item.packed,
      notes: item.notes,
      bundleId: item.bundleId,
      bundleName: item.bundle?.name ?? null,
      updatedAt: timestamp(item.updatedAt),
    })),
    createdAt: timestamp(list.createdAt),
    updatedAt: timestamp(list.updatedAt),
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
    items: bundle.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
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
    "Lists the household's packing lists, upcoming departures first, with the trip's season, duration and abroad flag and how much is packed. get-packing-list returns the items.",
  inputSchema: {
    query: filterTextSchema
      .optional()
      .describe("Case-insensitive substring match on the name or notes."),
    season: z.enum(PACKING_SEASONS).optional(),
    duration: z.enum(PACKING_DURATIONS).optional(),
    abroad: z.boolean().optional(),
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
      query: args.query,
      season: args.season,
      duration: args.duration,
      abroad: args.abroad,
    })
    const rows = lists.map((list) => ({
      id: list.id,
      name: list.name,
      ...serializeTrip(list),
      itemCount: list.items.length,
      packedCount: list.items.filter((item) => item.packed).length,
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
    "Returns one packing list with every item, whether it is packed, and the bundle it came from.",
  inputSchema: {
    listId: idSchema.describe("Id from list-packing-lists."),
  },
  outputSchema: { list: packingListCardSchema },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    assertId(args.listId, "listId")
    const list = await getPackingList(session.context, args.listId)
    if (!list) return notFoundError("pakkeliste")

    const card = serializePackingList(list)
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

export const packingTools = [
  listPackingListsTool,
  getPackingListTool,
  listPackingBundlesTool,
  getPackingBundleTool,
]
