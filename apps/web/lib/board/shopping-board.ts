import type { ItemStatus, Priority, Timeframe } from "@workspace/db"

import {
  DUE_BUCKETS,
  DUE_BUCKET_LABELS,
  dueBucket,
  dueDateForBucket,
  isDueBucketDroppable,
  type DueBucket,
} from "@/lib/board/due-date"
import type { BoardColumnDef, BoardGroupingOption } from "@/lib/board/types"
import type {
  ShoppingCategoryOption,
  ShoppingItemData,
  ShoppingMember,
} from "@/lib/shopping-item-view"
import { TIMEFRAMES, TIMEFRAME_LABELS } from "@/lib/shopping-timeframe"

/**
 * How the shopping board can be grouped, and what dropping a card in a column
 * changes. Each grouping is a field the item already has, so moving a card is
 * the same edit as changing that field in the item dialog.
 */

export const SHOPPING_GROUPINGS = [
  { id: "liste", label: "Liste" },
  { id: "prioritet", label: "Prioritet" },
  { id: "tidspunkt", label: "Når" },
  { id: "frist", label: "Frist" },
  { id: "kategori", label: "Kategori" },
  { id: "ansvarlig", label: "Ansvarlig" },
  { id: "status", label: "Status" },
] as const satisfies readonly BoardGroupingOption[]

export type ShoppingGrouping = (typeof SHOPPING_GROUPINGS)[number]["id"]

export interface ShoppingBoardList {
  id: string
  name: string
  color: string | null
  isPrivate: boolean
}

export interface ShoppingBoardContext {
  lists: ShoppingBoardList[]
  categories: ShoppingCategoryOption[]
  members: ShoppingMember[]
  /** `YYYY-MM-DD` in Norway. */
  today: string
}

/** What a drop changes. `listId` is a move; the rest is a field update. */
export type ShoppingItemPatch = {
  listId?: string
  priority?: Priority
  timeframe?: Timeframe | null
  dueDate?: Date | null
  categoryId?: string | null
  assignedToId?: string | null
  status?: ItemStatus
}

/** Column key for "no value", e.g. no category. Never a valid id. */
export const NONE_KEY = "none"

const PRIORITIES: Priority[] = ["HIGH", "MEDIUM", "LOW"]

export const PRIORITY_LABELS: Record<Priority, string> = {
  HIGH: "Høy",
  MEDIUM: "Medium",
  LOW: "Lav",
}

export const PRIORITY_ACCENTS: Record<Priority, string> = {
  HIGH: "bg-red-500",
  MEDIUM: "bg-yellow-500",
  LOW: "bg-green-500",
}

const ITEM_STATUSES: ItemStatus[] = ["PENDING", "PURCHASED", "SKIPPED"]

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  PENDING: "Skal kjøpes",
  PURCHASED: "Kjøpt",
  SKIPPED: "Hoppet over",
}

const DUE_ACCENTS: Partial<Record<DueBucket, string>> = {
  OVERDUE: "bg-red-500",
  TODAY: "bg-primary",
}

const DUE_HINTS: Partial<Record<DueBucket, string>> = {
  OVERDUE: "Sett en ny frist ved å flytte kortet til en annen kolonne.",
  LATER: "Velg en dato lenger frem i redigeringsvinduet.",
  THIS_WEEK: "Resten av uken er i dag og i morgen.",
}

export function dueColumns(today: string): BoardColumnDef[] {
  return DUE_BUCKETS.map((bucket) => {
    const droppable = isDueBucketDroppable(bucket, today)
    return {
      key: bucket,
      label: DUE_BUCKET_LABELS[bucket],
      droppable,
      hint: droppable ? undefined : DUE_HINTS[bucket],
      accentClassName: DUE_ACCENTS[bucket],
    }
  })
}

export function shoppingColumns(
  grouping: ShoppingGrouping,
  context: ShoppingBoardContext
): BoardColumnDef[] {
  switch (grouping) {
    case "liste":
      return context.lists.map((list) => ({
        key: list.id,
        label: list.name,
        droppable: true,
        isPrivate: list.isPrivate,
      }))
    case "prioritet":
      return PRIORITIES.map((priority) => ({
        key: priority,
        label: PRIORITY_LABELS[priority],
        droppable: true,
        accentClassName: PRIORITY_ACCENTS[priority],
      }))
    case "tidspunkt":
      return [
        ...TIMEFRAMES.map((timeframe) => ({
          key: timeframe,
          label: TIMEFRAME_LABELS[timeframe],
          droppable: true,
        })),
        { key: NONE_KEY, label: "Ikke satt", droppable: true },
      ]
    case "frist":
      return dueColumns(context.today)
    case "kategori":
      return [
        ...context.categories.map((category) => ({
          key: category.id,
          label: category.name,
          droppable: true,
        })),
        { key: NONE_KEY, label: "Uten kategori", droppable: true },
      ]
    case "ansvarlig":
      return [
        ...context.members.map((member) => ({
          key: member.id,
          label: member.name,
          droppable: true,
        })),
        { key: NONE_KEY, label: "Ikke tildelt", droppable: true },
      ]
    case "status":
      return ITEM_STATUSES.map((status) => ({
        key: status,
        label: ITEM_STATUS_LABELS[status],
        droppable: true,
        collapsedByDefault: status !== "PENDING",
        accentClassName: status === "PURCHASED" ? "bg-green-500" : undefined,
      }))
  }
}

export function shoppingColumnKey(
  item: ShoppingItemData,
  grouping: ShoppingGrouping,
  context: Pick<ShoppingBoardContext, "today" | "members">
): string {
  switch (grouping) {
    case "liste":
      return item.listId
    case "prioritet":
      return item.priority
    case "tidspunkt":
      return item.timeframe ?? NONE_KEY
    case "frist":
      return dueBucket(item.dueDate, context.today)
    case "kategori":
      return item.category?.id ?? NONE_KEY
    case "ansvarlig":
      // Removing a member keeps their assignments; without a column of their
      // own those items would vanish, so they show as unassigned.
      return item.assignedTo &&
        context.members.some((member) => member.id === item.assignedTo?.id)
        ? item.assignedTo.id
        : NONE_KEY
    case "status":
      return item.status
  }
}

/** The change a drop in `columnKey` makes, or `null` if it makes none. */
export function shoppingMovePatch(
  grouping: ShoppingGrouping,
  columnKey: string,
  context: ShoppingBoardContext
): ShoppingItemPatch | null {
  const orNull = (key: string) => (key === NONE_KEY ? null : key)

  switch (grouping) {
    case "liste":
      return context.lists.some((list) => list.id === columnKey)
        ? { listId: columnKey }
        : null
    case "prioritet":
      return (PRIORITIES as string[]).includes(columnKey)
        ? { priority: columnKey as Priority }
        : null
    case "tidspunkt":
      return columnKey === NONE_KEY ||
        (TIMEFRAMES as readonly string[]).includes(columnKey)
        ? { timeframe: orNull(columnKey) as Timeframe | null }
        : null
    case "frist": {
      if (!(DUE_BUCKETS as readonly string[]).includes(columnKey)) return null
      const dueDate = dueDateForBucket(columnKey as DueBucket, context.today)
      return dueDate === undefined ? null : { dueDate }
    }
    case "kategori":
      return columnKey === NONE_KEY ||
        context.categories.some((category) => category.id === columnKey)
        ? { categoryId: orNull(columnKey) }
        : null
    case "ansvarlig":
      return columnKey === NONE_KEY ||
        context.members.some((member) => member.id === columnKey)
        ? { assignedToId: orNull(columnKey) }
        : null
    case "status":
      return (ITEM_STATUSES as string[]).includes(columnKey)
        ? { status: columnKey as ItemStatus }
        : null
  }
}

/** The item as it will look once the patch is saved, for the optimistic view. */
export function applyShoppingPatch(
  item: ShoppingItemData,
  patch: ShoppingItemPatch,
  context: ShoppingBoardContext
): ShoppingItemData {
  const next = { ...item }
  if (patch.listId !== undefined) next.listId = patch.listId
  if (patch.priority !== undefined) next.priority = patch.priority
  if (patch.timeframe !== undefined) next.timeframe = patch.timeframe
  if (patch.dueDate !== undefined) {
    next.dueDate = patch.dueDate ? patch.dueDate.toISOString() : null
  }
  if (patch.categoryId !== undefined) {
    next.category =
      context.categories.find((c) => c.id === patch.categoryId) ?? null
  }
  if (patch.assignedToId !== undefined) {
    next.assignedTo =
      context.members.find((m) => m.id === patch.assignedToId) ?? null
  }
  if (patch.status !== undefined) {
    next.status = patch.status
    next.purchasedAt =
      patch.status === "PURCHASED"
        ? (item.purchasedAt ?? new Date().toISOString())
        : null
  }
  return next
}

const PRIORITY_ORDER: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

/** Card order inside a column: priority, then the nearest due date, then name. */
export function compareShoppingCards(a: ShoppingItemData, b: ShoppingItemData) {
  return (
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    compareDueDates(a.dueDate, b.dueDate) ||
    a.name.localeCompare(b.name, "nb")
  )
}

export function compareDueDates(a: string | null, b: string | null) {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  return a < b ? -1 : 1
}
