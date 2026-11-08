import {
  db,
  type ItemStatus,
  type Priority,
  type Prisma,
  type Timeframe,
} from "@workspace/db"

import type { ApplicationContext } from "../context"
import { getVisibleShoppingListsWhere } from "../../shopping-list-access"

export async function listShoppingLists(context: ApplicationContext) {
  return db.shoppingList.findMany({
    where: getVisibleShoppingListsWhere(context.householdId, context.userId),
    include: {
      items: {
        select: {
          id: true,
          status: true,
          estimatedPrice: true,
          alternatives: {
            select: { price: true },
            orderBy: { rank: "asc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  })
}

export async function listShoppingListsForDashboard(
  context: ApplicationContext
) {
  return db.shoppingList.findMany({
    where: getVisibleShoppingListsWhere(context.householdId, context.userId),
    include: {
      items: {
        include: {
          category: true,
          assignedTo: {
            select: {
              id: true,
              name: true,
            },
          },
          alternatives: {
            orderBy: { rank: "asc" },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  })
}

export async function getShoppingList(
  context: ApplicationContext,
  listId: string
) {
  return db.shoppingList.findFirst({
    where: {
      id: listId,
      ...getVisibleShoppingListsWhere(context.householdId, context.userId),
    },
    include: {
      items: {
        include: {
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          alternatives: {
            select: {
              id: true,
              name: true,
              price: true,
              url: true,
              imageUrl: true,
              storeName: true,
              notes: true,
              rank: true,
            },
            orderBy: { rank: "asc" },
          },
        },
        orderBy: [
          { status: "asc" },
          { priority: "asc" },
          { createdAt: "desc" },
        ],
      },
      shareLinks: {
        where: { isActive: true },
        select: {
          id: true,
          token: true,
          isActive: true,
        },
      },
      household: {
        select: {
          members: {
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          categories: {
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
            },
          },
        },
      },
    },
  })
}

export async function listShoppingCategories(context: ApplicationContext) {
  return db.category.findMany({
    where: { householdId: context.householdId },
    orderBy: { name: "asc" },
  })
}

// ─── Paged reads ────────────────────────────────────────────────
//
// These return only the columns an external caller is allowed to see. The
// browser reads above still fetch the full graph the pages need; keeping the
// two apart is what stops a `User` row from riding along into a tool response.

type PageOptions = {
  limit: number
  offset: number
}

function shoppingListFilter(
  context: ApplicationContext,
  name?: string
): Prisma.ShoppingListWhereInput {
  return {
    ...getVisibleShoppingListsWhere(context.householdId, context.userId),
    ...(name ? { name: { contains: name, mode: "insensitive" } } : {}),
  }
}

export async function listShoppingListsPage(
  context: ApplicationContext,
  options: PageOptions & { name?: string }
) {
  const where = shoppingListFilter(context, options.name)

  const [totalCount, lists] = await Promise.all([
    db.shoppingList.count({ where }),
    db.shoppingList.findMany({
      where,
      select: {
        id: true,
        name: true,
        color: true,
        isPrivate: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: {
            status: true,
            estimatedPrice: true,
            alternatives: {
              select: { price: true },
              orderBy: { rank: "asc" },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: options.offset,
      take: options.limit,
    }),
  ])

  return { totalCount, lists }
}

/**
 * The visibility rule is part of the query, not a check afterwards, so a
 * guessed list id from another household simply matches nothing.
 */
export async function getShoppingListSummary(
  context: ApplicationContext,
  listId: string
) {
  return db.shoppingList.findFirst({
    where: {
      id: listId,
      ...getVisibleShoppingListsWhere(context.householdId, context.userId),
    },
    select: {
      id: true,
      name: true,
      color: true,
      isPrivate: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

/**
 * Items are reached through the parent list, so the private-list rule applies
 * to a child id exactly as it does to the list itself.
 */
function shoppingItemFilter(
  context: ApplicationContext,
  listId: string,
  status?: ItemStatus
): Prisma.ShoppingItemWhereInput {
  return {
    listId,
    list: getVisibleShoppingListsWhere(context.householdId, context.userId),
    ...(status ? { status } : {}),
  }
}

export async function countShoppingItemsByStatus(
  context: ApplicationContext,
  listId: string
) {
  return db.shoppingItem.groupBy({
    by: ["status"],
    where: shoppingItemFilter(context, listId),
    _count: { _all: true },
  })
}

/** The columns a tool may return for an item. No `assignedTo`. */
function shoppingItemPageSelect(includeAlternatives: boolean) {
  return {
    id: true,
    name: true,
    description: true,
    status: true,
    priority: true,
    timeframe: true,
    dueDate: true,
    estimatedPrice: true,
    url: true,
    imageUrl: true,
    storeName: true,
    purchasedAt: true,
    createdAt: true,
    updatedAt: true,
    category: { select: { id: true, name: true } },
    alternatives: includeAlternatives
      ? {
          select: {
            id: true,
            name: true,
            price: true,
            url: true,
            imageUrl: true,
            storeName: true,
            notes: true,
            rank: true,
            updatedAt: true,
          },
          orderBy: { rank: "asc" as const },
        }
      : (false as const),
    _count: { select: { alternatives: true } },
  } satisfies Prisma.ShoppingItemSelect
}

const SHOPPING_ITEM_PAGE_ORDER = [
  { status: "asc" },
  { priority: "asc" },
  { createdAt: "desc" },
  { id: "asc" },
] satisfies Prisma.ShoppingItemOrderByWithRelationInput[]

export async function listShoppingItemsPage(
  context: ApplicationContext,
  listId: string,
  options: PageOptions & {
    status?: ItemStatus
    includeAlternatives: boolean
  }
) {
  const where = shoppingItemFilter(context, listId, options.status)

  const [totalCount, items] = await Promise.all([
    db.shoppingItem.count({ where }),
    db.shoppingItem.findMany({
      where,
      select: shoppingItemPageSelect(options.includeAlternatives),
      orderBy: SHOPPING_ITEM_PAGE_ORDER,
      skip: options.offset,
      take: options.limit,
    }),
  ])

  return { totalCount, items }
}

export type ShoppingItemSearch = {
  /** Case-insensitive match on name, description, store or alternative name. */
  query?: string
  listId?: string
  status?: ItemStatus
  priority?: Priority
  timeframe?: Timeframe
  /** `null` finds items without a category. */
  categoryId?: string | null
}

/**
 * Searches items across every list the caller can see. The visibility rule is
 * part of the `where`, so another member's private list never contributes.
 */
export async function searchShoppingItemsPage(
  context: ApplicationContext,
  options: PageOptions & ShoppingItemSearch & { includeAlternatives: boolean }
) {
  const where: Prisma.ShoppingItemWhereInput = {
    list: getVisibleShoppingListsWhere(context.householdId, context.userId),
    ...(options.listId ? { listId: options.listId } : {}),
    ...(options.status ? { status: options.status } : {}),
    ...(options.priority ? { priority: options.priority } : {}),
    ...(options.timeframe ? { timeframe: options.timeframe } : {}),
    ...(options.categoryId !== undefined
      ? { categoryId: options.categoryId }
      : {}),
    ...(options.query
      ? {
          OR: [
            { name: { contains: options.query, mode: "insensitive" } },
            { description: { contains: options.query, mode: "insensitive" } },
            { storeName: { contains: options.query, mode: "insensitive" } },
            {
              alternatives: {
                some: {
                  name: { contains: options.query, mode: "insensitive" },
                },
              },
            },
          ],
        }
      : {}),
  }

  const [totalCount, items] = await Promise.all([
    db.shoppingItem.count({ where }),
    db.shoppingItem.findMany({
      where,
      select: {
        ...shoppingItemPageSelect(options.includeAlternatives),
        list: { select: { id: true, name: true } },
      },
      orderBy: SHOPPING_ITEM_PAGE_ORDER,
      skip: options.offset,
      take: options.limit,
    }),
  ])

  return { totalCount, items }
}

export async function listShoppingCategoriesPage(
  context: ApplicationContext,
  options: PageOptions & { name?: string }
) {
  const where: Prisma.CategoryWhereInput = {
    householdId: context.householdId,
    ...(options.name
      ? { name: { contains: options.name, mode: "insensitive" } }
      : {}),
  }

  const [totalCount, categories] = await Promise.all([
    db.category.count({ where }),
    db.category.findMany({
      where,
      // No item count: a category spans every list in the household, so
      // counting its items would leak the size of other people's private
      // lists (chapter 7).
      select: {
        id: true,
        name: true,
        icon: true,
        color: true,
        isDefault: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: options.offset,
      take: options.limit,
    }),
  ])

  return { totalCount, categories }
}
