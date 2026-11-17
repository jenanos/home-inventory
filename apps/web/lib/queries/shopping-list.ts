import { db } from "@workspace/db"
import type { ApplicationContext } from "@/lib/application/context"
import {
  getShoppingList as readShoppingList,
  listShoppingLists,
} from "@/lib/application/shopping/read"
import {
  dealToday,
  listCurrentShoppingDeals,
} from "@/lib/application/shopping/deals"
import { getShoppingListItemEffectivePrice } from "@/lib/shopping-list-pricing"
import { toDealSummary, type DealView } from "@/lib/shopping-deals"

export async function getShoppingLists(context: ApplicationContext) {
  return listShoppingLists(context)
}

export async function getShoppingList(
  context: ApplicationContext,
  listId: string
) {
  return readShoppingList(context, listId)
}

/**
 * Current offers on items still to be bought, for the "Tilbud nå" panels.
 * `today` is the date in Norway the offer periods are read against.
 */
export async function getCurrentDeals(
  context: ApplicationContext,
  options: { listId?: string } = {}
): Promise<{ today: string; deals: DealView[] }> {
  const now = new Date()
  const { deals } = await listCurrentShoppingDeals(context, {
    listId: options.listId,
    now,
  })

  return {
    today: dealToday(now).toISOString().slice(0, 10),
    deals: deals.map(({ item, ...deal }) => {
      const plannedPrice = getShoppingListItemEffectivePrice(item)
      return {
        ...toDealSummary(deal),
        itemId: item.id,
        itemName: item.name,
        listId: item.list.id,
        listName: item.list.name,
        isPrivate: item.list.isPrivate,
        imageUrl: item.alternatives[0]?.imageUrl ?? item.imageUrl,
        targetPrice: item.dealTargetPrice
          ? item.dealTargetPrice.toNumber()
          : null,
        plannedPrice: plannedPrice > 0 ? plannedPrice : null,
      }
    }),
  }
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
