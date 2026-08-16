import { z } from "zod"

import {
  countShoppingItemsByStatus,
  getShoppingListSummary,
  listShoppingCategoriesPage,
  listShoppingItemsPage,
  listShoppingListsPage,
} from "../../application/shopping/read"
import { getShoppingListItemEffectivePrice } from "../../shopping-list-pricing"
import {
  buildPageInfo,
  pageInfoSchema,
  paginationInputSchema,
  resolvePageRequest,
} from "../pagination"
import { notFoundError, toolSuccess } from "../result"
import { defineTool, READ_ONLY_ANNOTATIONS } from "./define"
import {
  ITEM_STATUSES,
  PHASES,
  PRIORITIES,
  assertId,
  calculated,
  calendarDate,
  calendarDateOutputSchema,
  calculatedMoneySchema,
  filterTextSchema,
  idSchema,
  money,
  optionalTimestamp,
  storedMoneySchema,
  timestamp,
  timestampSchema,
} from "./shared"

const itemCountsSchema = z.object({
  total: z.number().int(),
  pending: z.number().int(),
  purchased: z.number().int(),
  skipped: z.number().int(),
})

function emptyCounts() {
  return { total: 0, pending: 0, purchased: 0, skipped: 0 }
}

const statusKey = {
  PENDING: "pending",
  PURCHASED: "purchased",
  SKIPPED: "skipped",
} as const

export const listShoppingListsTool = defineTool({
  name: "list-shopping-lists",
  scope: "shopping:read",
  title: "List shopping lists",
  description:
    "Lists the shopping lists the authenticated user can see, with item counts and estimated totals per status. Use it to find a list id before calling get-shopping-list. It does not return the items themselves.",
  inputSchema: {
    name: filterTextSchema
      .optional()
      .describe("Case-insensitive substring match on the list name."),
    ...paginationInputSchema,
  },
  outputSchema: {
    lists: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        color: z.string().nullable(),
        isPrivate: z
          .boolean()
          .describe("Private lists are visible only to their creator."),
        itemCounts: itemCountsSchema,
        estimatedTotal: calculatedMoneySchema.describe(
          "Estimated cost of every item, using the top-ranked alternative price when present."
        ),
        pendingTotal: calculatedMoneySchema,
        createdAt: timestampSchema,
        updatedAt: timestampSchema,
      })
    ),
    pageInfo: pageInfoSchema,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    const page = resolvePageRequest(args)
    const { totalCount, lists } = await listShoppingListsPage(session.context, {
      ...page,
      name: args.name,
    })

    const serialized = lists.map((list) => {
      const counts = emptyCounts()
      let estimatedTotal = 0
      let pendingTotal = 0

      for (const item of list.items) {
        counts.total += 1
        counts[statusKey[item.status]] += 1

        const price = getShoppingListItemEffectivePrice(item)
        estimatedTotal += price
        if (item.status === "PENDING") {
          pendingTotal += price
        }
      }

      return {
        id: list.id,
        name: list.name,
        color: list.color,
        isPrivate: list.isPrivate,
        itemCounts: counts,
        estimatedTotal: calculated(estimatedTotal),
        pendingTotal: calculated(pendingTotal),
        createdAt: timestamp(list.createdAt),
        updatedAt: timestamp(list.updatedAt),
      }
    })

    return toolSuccess(
      {
        lists: serialized,
        pageInfo: buildPageInfo(page, serialized.length, totalCount),
      },
      `Fant ${totalCount} handleliste(r); viser ${serialized.length}.`
    )
  },
})

export const getShoppingListTool = defineTool({
  name: "get-shopping-list",
  scope: "shopping:read",
  title: "Get a shopping list with its items",
  description:
    "Returns one shopping list and a page of its items. Alternatives are omitted unless includeAlternatives is set, which keeps responses small. Use list-shopping-lists first to find the id.",
  inputSchema: {
    listId: idSchema.describe("Id from list-shopping-lists."),
    status: z
      .enum(ITEM_STATUSES)
      .optional()
      .describe("Return only items in this status."),
    includeAlternatives: z
      .boolean()
      .optional()
      .describe(
        "Include product alternatives for each item. Defaults to false."
      ),
    ...paginationInputSchema,
  },
  outputSchema: {
    list: z.object({
      id: z.string(),
      name: z.string(),
      color: z.string().nullable(),
      isPrivate: z.boolean(),
      createdAt: timestampSchema,
      updatedAt: timestampSchema,
    }),
    itemCounts: itemCountsSchema.describe(
      "Counts for the whole list, unaffected by the status filter or paging."
    ),
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        status: z.enum(ITEM_STATUSES),
        priority: z.enum(PRIORITIES),
        phase: z.enum(PHASES).nullable(),
        dueDate: calendarDateOutputSchema,
        estimatedPrice: storedMoneySchema,
        url: z.string().nullable(),
        storeName: z.string().nullable(),
        purchasedAt: timestampSchema.nullable(),
        category: z.object({ id: z.string(), name: z.string() }).nullable(),
        alternativeCount: z.number().int(),
        alternatives: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              price: storedMoneySchema,
              url: z.string().nullable(),
              storeName: z.string().nullable(),
              notes: z.string().nullable(),
              rank: z.number().int(),
            })
          )
          .nullable()
          .describe("Null unless includeAlternatives was set."),
        createdAt: timestampSchema,
        updatedAt: timestampSchema,
      })
    ),
    pageInfo: pageInfoSchema,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    assertId(args.listId, "listId")

    const list = await getShoppingListSummary(session.context, args.listId)
    if (!list) {
      // Same answer for an unknown id and for another user's private list.
      return notFoundError("handleliste")
    }

    const page = resolvePageRequest(args)
    const includeAlternatives = args.includeAlternatives ?? false

    const [statusCounts, itemPage] = await Promise.all([
      countShoppingItemsByStatus(session.context, args.listId),
      listShoppingItemsPage(session.context, args.listId, {
        ...page,
        status: args.status,
        includeAlternatives,
      }),
    ])

    const counts = emptyCounts()
    for (const group of statusCounts) {
      counts[statusKey[group.status]] = group._count._all
      counts.total += group._count._all
    }

    // `assignedTo` is intentionally absent: it is another household member's
    // user record, and no level 1 tool has a reason to expose people.
    const items = itemPage.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      status: item.status,
      priority: item.priority,
      phase: item.phase,
      dueDate: calendarDate(item.dueDate),
      estimatedPrice: money(item.estimatedPrice),
      url: item.url,
      storeName: item.storeName,
      purchasedAt: optionalTimestamp(item.purchasedAt),
      category: item.category,
      alternativeCount: item._count.alternatives,
      alternatives: includeAlternatives
        ? (item.alternatives ?? []).map((alternative) => ({
            id: alternative.id,
            name: alternative.name,
            price: money(alternative.price),
            url: alternative.url,
            storeName: alternative.storeName,
            notes: alternative.notes,
            rank: alternative.rank,
          }))
        : null,
      createdAt: timestamp(item.createdAt),
      updatedAt: timestamp(item.updatedAt),
    }))

    return toolSuccess(
      {
        list: {
          id: list.id,
          name: list.name,
          color: list.color,
          isPrivate: list.isPrivate,
          createdAt: timestamp(list.createdAt),
          updatedAt: timestamp(list.updatedAt),
        },
        itemCounts: counts,
        items,
        pageInfo: buildPageInfo(page, items.length, itemPage.totalCount),
      },
      `${list.name}: ${counts.total} vare(r), ${counts.pending} gjenstår. Viser ${items.length}.`
    )
  },
})

export const listShoppingCategoriesTool = defineTool({
  name: "list-shopping-categories",
  scope: "shopping:read",
  title: "List shopping categories",
  description:
    "Lists the household's shopping categories. Use it to translate a category name into the id shown on shopping items.",
  inputSchema: {
    name: filterTextSchema
      .optional()
      .describe("Case-insensitive substring match on the category name."),
    ...paginationInputSchema,
  },
  outputSchema: {
    categories: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        icon: z.string().nullable(),
        color: z.string().nullable(),
        isDefault: z.boolean(),
      })
    ),
    pageInfo: pageInfoSchema,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    const page = resolvePageRequest(args)
    const { totalCount, categories } = await listShoppingCategoriesPage(
      session.context,
      { ...page, name: args.name }
    )

    return toolSuccess(
      {
        categories,
        pageInfo: buildPageInfo(page, categories.length, totalCount),
      },
      `Fant ${totalCount} kategori(er); viser ${categories.length}.`
    )
  },
})

export const shoppingTools = [
  listShoppingListsTool,
  getShoppingListTool,
  listShoppingCategoriesTool,
]
