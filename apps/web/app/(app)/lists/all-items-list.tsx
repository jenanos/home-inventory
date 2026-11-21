"use client"

import { useMemo, useOptimistic, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Eye, Lock, Package, Tag } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { cn } from "@workspace/ui/lib/utils"

import { CategoryIcon } from "@/components/category-icon"
import { setItemDealWatch } from "@/lib/actions/shopping-deal"
import { toggleItemPurchased } from "@/lib/actions/shopping-item"
import {
  PRIORITY_LABELS,
  compareShoppingCards,
  type ShoppingBoardList,
} from "@/lib/board/shopping-board"
import { getListColorPreset } from "@/lib/list-colors"
import { formatNOK } from "@/lib/project-labels"
import { formatDealPrice } from "@/lib/shopping-deals"
import type {
  ShoppingCategoryOption,
  ShoppingItemData,
  ShoppingMember,
} from "@/lib/shopping-item-view"
import { EditItemDialog } from "./[id]/edit-item-dialog"

const PRIORITY_DOT = {
  HIGH: "bg-red-500",
  MEDIUM: "bg-yellow-500",
  LOW: "bg-green-500",
} as const

/**
 * Every item on every list the user can see, as one long list under a heading
 * per list. Made for scrolling through on a phone: tick things off, or mark
 * the ones the deal check should watch, without opening each list.
 */
export function AllItemsList({
  items,
  lists,
  categories,
  members,
}: {
  items: ShoppingItemData[]
  lists: ShoppingBoardList[]
  categories: ShoppingCategoryOption[]
  members: ShoppingMember[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<ShoppingItemData | null>(null)
  const [onlyWatched, setOnlyWatched] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const doneCount = items.filter((item) => item.status !== "PENDING").length
  const watchedCount = items.filter(
    (item) => item.dealWatch && item.status === "PENDING"
  ).length

  const sections = useMemo(() => {
    const visible = items.filter(
      (item) =>
        (showDone || item.status === "PENDING") &&
        (!onlyWatched || item.dealWatch)
    )
    return lists
      .map((list) => ({
        list,
        items: visible
          .filter((item) => item.listId === list.id)
          .sort(
            (a, b) =>
              Number(a.status !== "PENDING") - Number(b.status !== "PENDING") ||
              compareShoppingCards(a, b)
          ),
      }))
      .filter((section) => section.items.length > 0)
  }, [items, lists, onlyWatched, showDone])

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={onlyWatched ? "secondary" : "outline"}
          size="sm"
          aria-pressed={onlyWatched}
          onClick={() => setOnlyWatched((value) => !value)}
          className={cn(
            onlyWatched &&
              "bg-amber-100 text-amber-900 hover:bg-amber-100/80 dark:bg-amber-500/20 dark:text-amber-200"
          )}
        >
          <Eye />
          Følges ({watchedCount})
        </Button>
        {doneCount > 0 && (
          <Button
            type="button"
            variant={showDone ? "secondary" : "outline"}
            size="sm"
            aria-pressed={showDone}
            onClick={() => setShowDone((value) => !value)}
          >
            Vis kjøpte ({doneCount})
          </Button>
        )}
      </div>

      {sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {onlyWatched
              ? "Ingen ting følges for tilbud ennå. Trykk på øyet ved en vare for å følge med på den."
              : "Ingen ting å kjøpe akkurat nå."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map(({ list, items: sectionItems }) => (
            <ListSection
              key={list.id}
              list={list}
              items={sectionItems}
              onOpen={setEditing}
            />
          ))}
        </div>
      )}

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

function ListSection({
  list,
  items,
  onOpen,
}: {
  list: ShoppingBoardList
  items: ShoppingItemData[]
  onOpen: (item: ShoppingItemData) => void
}) {
  const preset = getListColorPreset(list.color)

  return (
    <section aria-label={list.name} className="flex flex-col gap-1.5">
      <Link
        href={`/lists/${list.id}`}
        className="flex items-center gap-2 px-1 py-1 text-sm font-medium"
      >
        <span
          aria-hidden="true"
          className="h-4 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: preset.accent }}
        />
        {list.isPrivate && (
          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 truncate font-heading">{list.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {items.length}
        </span>
        <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
      <div className="divide-y overflow-hidden rounded-lg border bg-card ring-1 ring-foreground/5">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} onOpen={() => onOpen(item)} />
        ))}
      </div>
    </section>
  )
}

function ItemRow({
  item,
  onOpen,
}: {
  item: ShoppingItemData
  onOpen: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [, startWatchTransition] = useTransition()
  const [watched, setWatched] = useOptimistic(item.dealWatch)
  const isPurchased = item.status === "PURCHASED"
  const isMuted = item.status !== "PENDING"
  const image = item.alternatives[0]?.imageUrl ?? item.imageUrl
  const price = item.effectivePrice ?? 0

  function togglePurchased() {
    startTransition(async () => {
      await toggleItemPurchased(item.id)
    })
  }

  function toggleWatch() {
    const next = !watched
    startWatchTransition(async () => {
      setWatched(next)
      try {
        // Only the switch: a note or target price set earlier is kept.
        await setItemDealWatch({ itemId: item.id, watch: next })
      } catch {
        toast.error("Kunne ikke lagre. Prøv igjen.")
      }
    })
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2",
        isMuted && "opacity-60"
      )}
    >
      <Checkbox
        checked={isPurchased}
        onCheckedChange={togglePurchased}
        disabled={isPending}
        aria-label={`Merk ${item.name} som ${isPurchased ? "ikke kjøpt" : "kjøpt"}`}
      />

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-0.5 text-left"
      >
        {image && (
          <img
            src={image}
            alt=""
            className="size-9 shrink-0 rounded-md object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none"
            }}
          />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "truncate text-sm leading-snug font-medium",
              isPurchased && "text-muted-foreground line-through"
            )}
          >
            {item.name}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-label={`Prioritet ${PRIORITY_LABELS[item.priority]}`}
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                PRIORITY_DOT[item.priority]
              )}
            />
            {item.deal && !isMuted ? (
              <Badge className="h-4 shrink-0 bg-amber-100 px-1 text-[10px] text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                <Tag className="size-2.5" />
                {formatDealPrice(item.deal.price)} · {item.deal.store}
              </Badge>
            ) : item.category ? (
              <span className="flex min-w-0 items-center gap-1">
                {item.category.icon && (
                  <CategoryIcon
                    name={item.category.icon}
                    className="size-3 shrink-0"
                  />
                )}
                <span className="truncate">{item.category.name}</span>
              </span>
            ) : null}
            {price > 0 && (
              <span
                className={cn(
                  "ml-auto shrink-0 font-medium text-foreground tabular-nums",
                  isPurchased && "text-muted-foreground line-through"
                )}
              >
                {formatNOK(price)}
              </span>
            )}
          </span>
        </span>
      </button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggleWatch}
        aria-pressed={watched}
        aria-label={
          watched
            ? `Slutt å følge med på tilbud for ${item.name}`
            : `Følg med på tilbud for ${item.name}`
        }
        title={watched ? "Følges for tilbud" : "Følg med på tilbud"}
        className={cn(
          "-mr-1.5 shrink-0",
          watched
            ? "bg-amber-100 text-amber-700 hover:bg-amber-100/80 hover:text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
            : "text-muted-foreground/50"
        )}
      >
        <Eye className={cn("size-4.5", watched && "fill-current/20")} />
      </Button>
    </div>
  )
}
