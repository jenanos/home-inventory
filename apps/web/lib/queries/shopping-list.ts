import { db } from "@workspace/db"
import type { ApplicationContext } from "@/lib/application/context"
import {
  getShoppingList as readShoppingList,
  listShoppingLists,
} from "@/lib/application/shopping/read"

export async function getShoppingLists(context: ApplicationContext) {
  return listShoppingLists(context)
}

export async function getShoppingList(
  context: ApplicationContext,
  listId: string
) {
  return readShoppingList(context, listId)
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
