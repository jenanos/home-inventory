import { db } from "@workspace/db"

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
