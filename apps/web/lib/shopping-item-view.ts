import type { ShoppingItemView } from "@/lib/application/shopping/read"
import { isDealCurrent } from "@/lib/application/shopping/deals"
import { toDealSummary, type DealSummary } from "@/lib/shopping-deals"

/**
 * The browser's copy of a shopping item, shared by the list page and the
 * board. Prices are plain numbers and dates ISO strings, since neither a
 * Prisma `Decimal` nor a `Date` belongs in client props.
 */

export interface AlternativeData {
  id: string
  name: string
  price: number | null
  url: string | null
  imageUrl: string | null
  storeName: string | null
  notes: string | null
  rank: number
}

export interface ShoppingItemData {
  id: string
  name: string
  description: string | null
  priority: "HIGH" | "MEDIUM" | "LOW"
  dueDate: string | null
  estimatedPrice: number | null
  effectivePrice: number | null
  url: string | null
  imageUrl: string | null
  storeName: string | null
  status: "PENDING" | "PURCHASED" | "SKIPPED"
  purchasedAt: string | null
  category: {
    id: string
    name: string
    icon: string | null
    color: string | null
  } | null
  assignedTo: {
    id: string
    name: string
    email: string
  } | null
  alternatives: AlternativeData[]
  /** Watched for store offers by the household's deal check. */
  dealWatch: boolean
  dealWatchNote: string | null
  dealTargetPrice: number | null
  dealCheckedAt: string | null
  /** The current offer, if a check found one. */
  deal: DealSummary | null
  listId: string
  createdAt: string
  updatedAt: string
}

export function toShoppingItemData(item: ShoppingItemView): ShoppingItemData {
  const alternatives = item.alternatives.map((alt) => ({
    id: alt.id,
    name: alt.name,
    price: alt.price ? Number(alt.price) : null,
    url: alt.url,
    imageUrl: alt.imageUrl,
    storeName: alt.storeName,
    notes: alt.notes,
    rank: alt.rank,
  }))

  // Preferred alternative (rank 0) takes precedence for price, url, store, image
  const topAlternative = alternatives[0] ?? null
  const effectivePrice =
    topAlternative?.price != null
      ? topAlternative.price
      : item.estimatedPrice
        ? Number(item.estimatedPrice)
        : null

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    priority: item.priority,
    dueDate: item.dueDate ? item.dueDate.toISOString() : null,
    estimatedPrice: item.estimatedPrice ? Number(item.estimatedPrice) : null,
    effectivePrice,
    url: item.url,
    imageUrl: item.imageUrl,
    storeName: item.storeName,
    status: item.status,
    purchasedAt: item.purchasedAt ? item.purchasedAt.toISOString() : null,
    category: item.category
      ? {
          id: item.category.id,
          name: item.category.name,
          icon: item.category.icon,
          color: item.category.color,
        }
      : null,
    assignedTo: item.assignedTo
      ? {
          id: item.assignedTo.id,
          name: item.assignedTo.name ?? item.assignedTo.email,
          email: item.assignedTo.email,
        }
      : null,
    alternatives,
    dealWatch: item.dealWatch,
    dealWatchNote: item.dealWatchNote,
    dealTargetPrice: item.dealTargetPrice ? Number(item.dealTargetPrice) : null,
    dealCheckedAt: item.dealCheckedAt ? item.dealCheckedAt.toISOString() : null,
    deal:
      item.deal && isDealCurrent(item.deal) ? toDealSummary(item.deal) : null,
    listId: item.listId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}

export type ShoppingMember = { id: string; name: string; email: string }

export type ShoppingCategoryOption = {
  id: string
  name: string
  icon: string | null
  color: string | null
}

export function toShoppingMembers(
  members: Array<{
    user: { id: string; name: string | null; email: string }
  }>
): ShoppingMember[] {
  return members.map((m) => ({
    id: m.user.id,
    name: m.user.name ?? m.user.email,
    email: m.user.email,
  }))
}
