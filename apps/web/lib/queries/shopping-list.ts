import { db } from "@workspace/db"

export async function getShoppingList(listId: string, householdId: string) {
  const list = await db.shoppingList.findUnique({
    where: { id: listId },
    include: {
      items: {
        include: {
          category: true,
          assignedTo: true,
        },
        orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
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

  if (!list || list.householdId !== householdId) {
    return null
  }

  return list
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

  return shareLink.list
}
