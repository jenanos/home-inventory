"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Calendar, Lock, Tag, User } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { cn } from "@workspace/ui/lib/utils"

import { CategoryIcon } from "@/components/category-icon"
import { KanbanBoard } from "@/components/board/kanban-board"
import {
  moveShoppingItem,
  toggleItemPurchased,
  updateShoppingItem,
} from "@/lib/actions/shopping-item"
import { useOsloToday } from "@/hooks/use-oslo-today"
import { dueBucket } from "@/lib/board/due-date"
import {
  PRIORITY_LABELS,
  applyShoppingPatch,
  compareShoppingCards,
  shoppingColumnKey,
  shoppingColumns,
  shoppingMovePatch,
  type ShoppingBoardContext,
  type ShoppingBoardList,
  type ShoppingGrouping,
} from "@/lib/board/shopping-board"
import { formatNOK } from "@/lib/project-labels"
import { formatDealPrice } from "@/lib/shopping-deals"
import { filterShoppingItems } from "@/lib/shopping-item-filters"
import type {
  ShoppingCategoryOption,
  ShoppingItemData,
  ShoppingMember,
} from "@/lib/shopping-item-view"
import { EditItemDialog } from "./[id]/edit-item-dialog"

const PRIORITY_BADGE = {
  HIGH: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  MEDIUM:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  LOW: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
} as const

const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Oslo",
  }).format(new Date(value))

/**
 * Shopping items as a board. On the overview it spans every list the user can
 * see, so a card can move between lists; on a list page it holds that list
 * and honours the page's filters.
 */
export function ShoppingBoard({
  items,
  lists,
  categories,
  members,
  grouping,
  applyListFilters = false,
}: {
  items: ShoppingItemData[]
  lists: ShoppingBoardList[]
  categories: ShoppingCategoryOption[]
  members: ShoppingMember[]
  grouping: ShoppingGrouping
  /** Apply the list page's URL filters (category, priority, …). */
  applyListFilters?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [editing, setEditing] = useState<ShoppingItemData | null>(null)

  const today = useOsloToday()
  const context = useMemo<ShoppingBoardContext>(
    () => ({ lists, categories, members, today }),
    [lists, categories, members, today]
  )
  const listById = useMemo(
    () => new Map(lists.map((list) => [list.id, list])),
    [lists]
  )

  const visibleItems = useMemo(
    () => (applyListFilters ? filterShoppingItems(items, searchParams) : items),
    [applyListFilters, items, searchParams]
  )

  const columns = useMemo(
    () => shoppingColumns(grouping, context),
    [grouping, context]
  )

  const getColumnKey = useCallback(
    (item: ShoppingItemData) => shoppingColumnKey(item, grouping, context),
    [grouping, context]
  )

  const applyMove = useCallback(
    (item: ShoppingItemData, columnKey: string) => {
      const patch = shoppingMovePatch(grouping, columnKey, context)
      return patch ? applyShoppingPatch(item, patch, context) : null
    },
    [grouping, context]
  )

  const onMove = useCallback(
    async (item: ShoppingItemData, columnKey: string) => {
      const patch = shoppingMovePatch(grouping, columnKey, context)
      if (!patch) return
      const { listId, ...fields } = patch
      if (listId) {
        await moveShoppingItem({
          itemId: item.id,
          targetListId: listId,
          fromListId: item.listId,
        })
      } else {
        await updateShoppingItem({ id: item.id, ...fields })
      }
    },
    [grouping, context]
  )

  const showList = lists.length > 1 && grouping !== "liste"

  return (
    <>
      <KanbanBoard
        items={visibleItems}
        columns={columns}
        getId={(item) => item.id}
        getLabel={(item) => item.name}
        getColumnKey={getColumnKey}
        isDone={
          grouping === "status"
            ? undefined
            : (item) => item.status !== "PENDING"
        }
        doneLabel="Kjøpt eller hoppet over"
        compare={compareShoppingCards}
        applyMove={applyMove}
        onMove={onMove}
        onOpen={setEditing}
        emptyLabel="Ingen ting her"
        renderColumnSummary={(columnItems) => {
          const total = columnItems.reduce(
            (sum, item) =>
              item.status === "PENDING"
                ? sum + (item.effectivePrice ?? 0)
                : sum,
            0
          )
          return total > 0 ? formatNOK(total) : null
        }}
        renderCard={(item) => (
          <ShoppingBoardCard
            item={item}
            grouping={grouping}
            today={context.today}
            list={showList ? listById.get(item.listId) : undefined}
          />
        )}
      />

      <EditItemDialog
        item={editing}
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
            // Alternatives and offer watches are saved from the dialog too,
            // and those only refresh the list's own page.
            router.refresh()
          }
        }}
        categories={categories}
        members={members}
        listId={editing?.listId ?? ""}
      />
    </>
  )
}

function ShoppingBoardCard({
  item,
  grouping,
  today,
  list,
}: {
  item: ShoppingItemData
  grouping: ShoppingGrouping
  today: string
  list?: ShoppingBoardList
}) {
  const [isPending, startTransition] = useTransition()
  const isPurchased = item.status === "PURCHASED"
  const isMuted = item.status !== "PENDING"
  const image = item.alternatives[0]?.imageUrl ?? item.imageUrl
  const overdue =
    !isMuted && item.dueDate && dueBucket(item.dueDate, today) === "OVERDUE"
  const badge = "h-5 px-1.5 text-[11px]"

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-2.5 text-left shadow-xs transition-colors hover:border-foreground/20",
        isMuted && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="pt-0.5"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={isPurchased}
            disabled={isPending}
            onCheckedChange={() =>
              startTransition(async () => {
                await toggleItemPurchased(item.id)
              })
            }
            aria-label={`Merk ${item.name} som ${isPurchased ? "ikke kjøpt" : "kjøpt"}`}
          />
        </span>
        <p
          className={cn(
            "min-w-0 flex-1 text-sm leading-snug font-medium",
            isPurchased && "text-muted-foreground line-through"
          )}
        >
          {item.name}
        </p>
        {image && (
          <img
            src={image}
            alt=""
            draggable={false}
            className="size-9 shrink-0 rounded-md object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none"
            }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {grouping !== "prioritet" && (
          <Badge
            variant="outline"
            className={cn(badge, PRIORITY_BADGE[item.priority])}
          >
            {PRIORITY_LABELS[item.priority]}
          </Badge>
        )}
        {grouping !== "kategori" && item.category && (
          <Badge variant="secondary" className={badge}>
            {item.category.icon && (
              <CategoryIcon name={item.category.icon} className="size-3" />
            )}
            {item.category.name}
          </Badge>
        )}
        {item.deal && !isMuted && (
          <Badge
            className={cn(
              badge,
              "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
            )}
          >
            <Tag className="size-3" />
            {formatDealPrice(item.deal.price)}
          </Badge>
        )}
      </div>

      {(list ||
        item.dueDate ||
        (grouping !== "ansvarlig" && item.assignedTo) ||
        (item.effectivePrice ?? 0) > 0) && (
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          {list && (
            <span className="flex min-w-0 items-center gap-1">
              {list.isPrivate && <Lock className="size-3 shrink-0" />}
              <span className="truncate">{list.name}</span>
            </span>
          )}
          {item.dueDate && (
            <span
              className={cn(
                "flex shrink-0 items-center gap-1",
                overdue && "font-medium text-red-600 dark:text-red-400"
              )}
            >
              <Calendar className="size-3" />
              {formatShortDate(item.dueDate)}
            </span>
          )}
          {grouping !== "ansvarlig" && item.assignedTo && (
            <span
              className="flex min-w-0 items-center gap-1"
              title={item.assignedTo.name}
            >
              <User className="size-3 shrink-0" />
              <span className="truncate">
                {item.assignedTo.name.split(" ")[0]}
              </span>
            </span>
          )}
          {(item.effectivePrice ?? 0) > 0 && (
            <span
              className={cn(
                "ml-auto shrink-0 font-medium text-foreground tabular-nums",
                isPurchased && "text-muted-foreground line-through"
              )}
            >
              {formatNOK(item.effectivePrice!)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
