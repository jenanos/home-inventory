"use client"

import { useState, useTransition, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
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

const PHASE_LABELS: Record<string, string> = {
  BEFORE_MOVE: "For innflytting",
  FIRST_WEEK: "Forste uke",
  CAN_WAIT: "Kan vente",
  NO_RUSH: "Ingen hast",
}

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
  phase: "BEFORE_MOVE" | "FIRST_WEEK" | "CAN_WAIT" | "NO_RUSH" | null
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
    const phaseFilter = searchParams.get("phase")
    const assignedFilter = searchParams.get("assigned")
    const statusFilter = searchParams.get("status")
    const sort = searchParams.get("sort") ?? "priority"

    if (categoryFilter) {
      result = result.filter((item) => item.category?.id === categoryFilter)
    }
    if (priorityFilter) {
      result = result.filter((item) => item.priority === priorityFilter)
    }
    if (phaseFilter) {
      result = result.filter((item) => item.phase === phaseFilter)
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
      {/* Mobile: Card view */}
      <div className="flex flex-col gap-2 md:hidden">
        {filteredAndSorted.map((item) => (
          <MobileItemCard
            key={item.id}
            item={item}
            onEdit={() => setEditingItem(item)}
          />
        ))}
      </div>

      {/* Desktop: Table view */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Navn</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Prioritet</TableHead>
              <TableHead>Pris</TableHead>
              <TableHead>Butikk</TableHead>
              <TableHead>Tildelt</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSorted.map((item) => (
              <DesktopItemRow
                key={item.id}
                item={item}
                onEdit={() => setEditingItem(item)}
              />
            ))}
          </TableBody>
        </Table>
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

function MobileItemCard({
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

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg border bg-card p-3 ring-1 ring-foreground/5 transition-colors",
        isMuted && "opacity-60"
      )}
    >
      <div className="pt-0.5">
        <Checkbox
          checked={isPurchased}
          onCheckedChange={handleToggle}
          disabled={isPending}
          aria-label={`Merk ${item.name} som ${isPurchased ? "ikke kjopt" : "kjopt"}`}
        />
      </div>

      {/* Show selected alternative's image, or item's own image */}
      {(selectedAltImage || item.imageUrl) && (
        <img
          src={selectedAltImage ?? item.imageUrl!}
          alt={item.name}
          className="h-10 w-10 rounded-md object-cover shrink-0"
          onError={(e) => { e.currentTarget.style.display = "none" }}
        />
      )}

      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={onEdit}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onEdit() }}
      >
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-sm font-medium leading-tight",
              isPurchased && "line-through text-muted-foreground"
            )}
          >
            {item.name}
          </p>
          {item.effectivePrice != null && item.effectivePrice > 0 && (
            <span
              className={cn(
                "text-sm font-medium tabular-nums shrink-0",
                isPurchased && "line-through text-muted-foreground",
                !item.estimatedPrice && item.alternatives.length > 0 && "text-muted-foreground italic"
              )}
            >
              {formatCurrency(item.effectivePrice)}
            </span>
          )}
        </div>

        {item.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {item.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <Badge
            variant="outline"
            className={cn("text-[10px] px-1.5 h-4", PRIORITY_CONFIG[item.priority].className)}
          >
            {PRIORITY_CONFIG[item.priority].label}
          </Badge>

          {item.category && (
            <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
              {item.category.icon && (
                <CategoryIcon name={item.category.icon} className="mr-0.5 h-2.5 w-2.5" />
              )}
              {item.category.name}
            </Badge>
          )}

          {item.phase && (
            <Badge variant="outline" className="text-[10px] px-1.5 h-4">
              {PHASE_LABELS[item.phase]}
            </Badge>
          )}

          {item.assignedTo && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <User className="h-2.5 w-2.5" />
              {item.assignedTo.name}
            </span>
          )}

          {effectiveStore && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Store className="h-2.5 w-2.5" />
              {effectiveStore}
            </span>
          )}

          {item.dueDate && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Calendar className="h-2.5 w-2.5" />
              {formatDate(item.dueDate)}
            </span>
          )}

          {effectiveUrl && (
            <a
              href={effectiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-0.5 text-[10px] text-primary hover:underline"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Lenke
            </a>
          )}

          {item.alternatives.length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Layers className="h-2.5 w-2.5" />
              Produktvalg ({item.alternatives.length})
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function DesktopItemRow({
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

  return (
    <TableRow className={cn(isMuted && "opacity-50")}>
      <TableCell>
        <Checkbox
          checked={isPurchased}
          onCheckedChange={handleToggle}
          disabled={isPending}
          aria-label={`Merk ${item.name} som ${isPurchased ? "ikke kjopt" : "kjopt"}`}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-start gap-2.5">
          {(selectedAltImage || item.imageUrl) && (
            <img
              src={selectedAltImage ?? item.imageUrl!}
              alt={item.name}
              className="h-9 w-9 rounded-md object-cover shrink-0 mt-0.5"
              onError={(e) => { e.currentTarget.style.display = "none" }}
            />
          )}
          <div className="flex flex-col">
            <span
              className={cn(
                "font-medium",
                isPurchased && "line-through text-muted-foreground"
              )}
            >
              {item.name}
            </span>
          {item.description && (
            <span className="text-xs text-muted-foreground line-clamp-1">
              {item.description}
            </span>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            {item.phase && (
              <span className="text-[10px] text-muted-foreground">
                {PHASE_LABELS[item.phase]}
              </span>
            )}
            {item.dueDate && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Calendar className="h-2.5 w-2.5" />
                {formatDate(item.dueDate)}
              </span>
            )}
            {effectiveUrl && (
              <a
                href={effectiveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-[10px] text-primary hover:underline"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                Lenke
              </a>
            )}
          </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {item.category ? (
          <Badge variant="secondary" className="text-xs">
            {item.category.icon && (
              <CategoryIcon name={item.category.icon} className="mr-0.5 h-3 w-3" />
            )}
            {item.category.name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("text-xs", PRIORITY_CONFIG[item.priority].className)}
        >
          {PRIORITY_CONFIG[item.priority].label}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          {item.effectivePrice != null && item.effectivePrice > 0 ? (
            <span
              className={cn(
                "tabular-nums",
                isPurchased && "line-through text-muted-foreground",
                !item.estimatedPrice && item.alternatives.length > 0 && "text-muted-foreground italic"
              )}
            >
              {formatCurrency(item.effectivePrice)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {item.alternatives.length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground mt-0.5">
              <Layers className="h-2.5 w-2.5" />
              Produktvalg ({item.alternatives.length})
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {effectiveStore ? (
          <span className="flex items-center gap-1 text-xs">
            <Store className="h-3 w-3 text-muted-foreground" />
            {effectiveStore}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {item.assignedTo ? (
          <span className="flex items-center gap-1 text-xs">
            <User className="h-3 w-3 text-muted-foreground" />
            {item.assignedTo.name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onEdit}
          aria-label={`Rediger ${item.name}`}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </TableCell>
    </TableRow>
  )
}
