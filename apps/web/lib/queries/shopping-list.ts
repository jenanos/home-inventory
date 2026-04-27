import { db } from "@workspace/db"
import { getVisibleShoppingListsWhere } from "@/lib/shopping-list-access"

export async function getShoppingLists(householdId: string, userId: string) {
  const lists = await db.shoppingList.findMany({
    where: getVisibleShoppingListsWhere(householdId, userId),
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

  return lists
}

export async function getShoppingList(
  listId: string,
  householdId: string,
  userId: string
) {
  const list = await db.shoppingList.findFirst({
    where: {
      id: listId,
      ...getVisibleShoppingListsWhere(householdId, userId),
    },
    include: {
      items: {
        include: {
          category: true,
          assignedTo: true,
          alternatives: {
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
      },
      household: {
        include: {
          members: {
            include: { user: true },
          },
          categories: {
            orderBy: { name: "asc" },
          },
        },
      },
    },
  })

  return list ?? null
}

export async function getSharedList(token: string) {
  const shareLink = await db.shareLink.findUnique({
    where: { token },
    include: {
      list: {
        include: {
          items: {
            include: {
              category: true,
              assignedTo: true,
              alternatives: {
                orderBy: { rank: "asc" },
              },
            },
            orderBy: [
              { status: "asc" },
              { priority: "asc" },
              { createdAt: "desc" },
            ],
          },
          household: true,
        },
      },
    },
  })

  if (!shareLink || !shareLink.isActive) return null
  if (shareLink.expiresAt && shareLink.expiresAt < new Date()) return null

  if (shareLink.list.isPrivate) return null

  return shareLink.list
}
