"use client"

import { useState, useTransition, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import {
  ExternalLink,
  User,
  Store,
  Calendar,
  Pencil,
  Package,
  Layers,
} from "lucide-react"
import { CategoryIcon } from "@/components/category-icon"
import { toggleItemPurchased } from "@/lib/actions/shopping-item"
import { EditItemDialog } from "./edit-item-dialog"
import { timeframeLabel } from "@/lib/shopping-timeframe"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short",
  }).format(new Date(dateStr))

const PRIORITY_CONFIG = {
  HIGH: { label: "Hoy", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  MEDIUM: { label: "Medium", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  LOW: { label: "Lav", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
} as const

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
  timeframe: "NOW" | "SOON" | "LATER" | "SOMEDAY" | null
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
  listId: string
  createdAt: string
  updatedAt: string
}

interface ItemListProps {
  items: ShoppingItemData[]
  categories: Array<{ id: string; name: string; icon: string | null; color: string | null }>
  members: Array<{ id: string; name: string; email: string }>
  listId: string
}

const PRIORITY_SORT_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 }

export function ItemList({ items, categories, members, listId }: ItemListProps) {
  const searchParams = useSearchParams()
  const [editingItem, setEditingItem] = useState<ShoppingItemData | null>(null)

  const filteredAndSorted = useMemo(() => {
    let result = [...items]

    const categoryFilter = searchParams.get("category")
    const priorityFilter = searchParams.get("priority")
    const timeframeFilter = searchParams.get("timeframe")
    const assignedFilter = searchParams.get("assigned")
    const statusFilter = searchParams.get("status")
    const sort = searchParams.get("sort") ?? "priority"

    if (categoryFilter) {
      result = result.filter((item) => item.category?.id === categoryFilter)
    }
    if (priorityFilter) {
      result = result.filter((item) => item.priority === priorityFilter)
    }
    if (timeframeFilter) {
      result = result.filter((item) => item.timeframe === timeframeFilter)
    }
    if (assignedFilter) {
      result = result.filter((item) => item.assignedTo?.id === assignedFilter)
    }
    if (statusFilter) {
      result = result.filter((item) => item.status === statusFilter)
    }

    result.sort((a, b) => {
      // Always push purchased/skipped to the bottom
      const aCompleted = a.status !== "PENDING" ? 1 : 0
      const bCompleted = b.status !== "PENDING" ? 1 : 0
      if (aCompleted !== bCompleted) return aCompleted - bCompleted

      switch (sort) {
        case "priority":
          return PRIORITY_SORT_ORDER[a.priority] - PRIORITY_SORT_ORDER[b.priority]
        case "price": {
          const aPrice = a.effectivePrice ?? 0
          const bPrice = b.effectivePrice ?? 0
          return bPrice - aPrice
        }
        case "date":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case "category": {
          const aCat = a.category?.name ?? "zzz"
          const bCat = b.category?.name ?? "zzz"
          return aCat.localeCompare(bCat, "nb")
        }
        case "name":
          return a.name.localeCompare(b.name, "nb")
        default:
          return 0
      }
    })

    return result
  }, [items, searchParams])

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Package className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-heading text-base font-medium">
            Ingen ting pa listen enna
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Legg til ting du trenger ved a trykke &quot;Legg til&quot;.
          </p>
        </div>
      </div>
    )
  }

  if (filteredAndSorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Ingen ting matcher filtrene dine.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {filteredAndSorted.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            onEdit={() => setEditingItem(item)}
          />
        ))}
      </div>

      <EditItemDialog
        item={editingItem}
        open={!!editingItem}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null)
        }}
        categories={categories}
        members={members}
        listId={listId}
      />
    </>
  )
}

function ItemCard({
  item,
  onEdit,
}: {
  item: ShoppingItemData
  onEdit: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const isPurchased = item.status === "PURCHASED"
  const isSkipped = item.status === "SKIPPED"
  const isMuted = isPurchased || isSkipped

  // Show selected (rank 0) alternative's image if available
  const selectedAlt = item.alternatives[0] ?? null
  const selectedAltImage = selectedAlt?.imageUrl ?? null
  const effectiveUrl = item.url || selectedAlt?.url || null
  const effectiveStore = item.storeName || selectedAlt?.storeName || null

  function handleToggle() {
    startTransition(async () => {
      await toggleItemPurchased(item.id)
    })
  }

  const metaClass =
    "flex items-center gap-0.5 text-[10px] text-muted-foreground md:gap-1 md:text-xs"
  const metaIconClass = "h-2.5 w-2.5 md:h-3 md:w-3"
  const badgeClass = "h-4 px-1.5 text-[10px] md:h-5 md:px-2 md:text-xs"

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg border bg-card p-3 ring-1 ring-foreground/5 transition-colors md:gap-4 md:px-4 md:hover:bg-muted/40",
        isMuted && "opacity-60"
      )}
    >
      <div className="flex w-10 shrink-0 flex-col items-center gap-3 pt-0.5 md:w-12">
        <Checkbox
          checked={isPurchased}
          onCheckedChange={handleToggle}
          disabled={isPending}
          aria-label={`Merk ${item.name} som ${isPurchased ? "ikke kjopt" : "kjopt"}`}
        />
        {/* Show selected alternative's image, or item's own image */}
        {(selectedAltImage || item.imageUrl) && (
          <img
            src={selectedAltImage ?? item.imageUrl!}
            alt={item.name}
            className="h-10 w-10 rounded-md object-cover md:h-12 md:w-12"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
        )}
      </div>

      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={onEdit}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          // Ignore keys bubbling up from nested controls (e.g. the product link)
          if (e.target !== e.currentTarget) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onEdit()
          }
        }}
      >
        <div className="flex items-start justify-between gap-2 md:gap-6">
          <p
            className={cn(
              "text-sm font-medium leading-tight md:text-base",
              isPurchased && "line-through text-muted-foreground"
            )}
          >
            {item.name}
          </p>
          {item.effectivePrice != null && item.effectivePrice > 0 && (
            <span
              className={cn(
                "text-sm font-medium tabular-nums shrink-0 md:text-base",
                isPurchased && "line-through text-muted-foreground",
                !item.estimatedPrice && item.alternatives.length > 0 && "text-muted-foreground italic"
              )}
            >
              {formatCurrency(item.effectivePrice)}
            </span>
          )}
        </div>

        {item.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground md:mt-1 md:line-clamp-2 md:max-w-3xl md:text-sm">
            {item.description}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5 md:mt-2.5 md:gap-x-3 md:gap-y-1.5">
          <Badge
            variant="outline"
            className={cn(badgeClass, PRIORITY_CONFIG[item.priority].className)}
          >
            {PRIORITY_CONFIG[item.priority].label}
          </Badge>

          {item.category && (
            <Badge variant="secondary" className={badgeClass}>
              {item.category.icon && (
                <CategoryIcon name={item.category.icon} className={cn("mr-0.5", metaIconClass)} />
              )}
              {item.category.name}
            </Badge>
          )}

          {item.timeframe && (
            <Badge variant="outline" className={badgeClass}>
              {timeframeLabel(item.timeframe)}
            </Badge>
          )}

          {item.assignedTo && (
            <span className={metaClass}>
              <User className={metaIconClass} />
              {item.assignedTo.name}
            </span>
          )}

          {effectiveStore && (
            <span className={metaClass}>
              <Store className={metaIconClass} />
              {effectiveStore}
            </span>
          )}

          {item.dueDate && (
            <span className={metaClass}>
              <Calendar className={metaIconClass} />
              {formatDate(item.dueDate)}
            </span>
          )}

          {effectiveUrl && (
            <a
              href={effectiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn(metaClass, "text-primary hover:underline")}
            >
              <ExternalLink className={metaIconClass} />
              Lenke
            </a>
          )}

          {item.alternatives.length > 0 && (
            <span className={metaClass}>
              <Layers className={metaIconClass} />
              Produktvalg ({item.alternatives.length})
            </span>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onEdit}
        aria-label={`Rediger ${item.name}`}
        className="hidden text-muted-foreground md:inline-flex"
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  )
}
