"use client"

import { useState, useEffect, useTransition } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@workspace/ui/components/drawer"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Calendar } from "@workspace/ui/components/calendar"
import { Separator } from "@workspace/ui/components/separator"
import { Badge } from "@workspace/ui/components/badge"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"
import {
  Loader2,
  CalendarIcon,
  Trash2,
  Save,
  Plus,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
  Star,
  Check,
  ImageIcon,
  Store,
} from "lucide-react"
import { CategoryIcon } from "@/components/category-icon"
import {
  updateShoppingItem,
  deleteShoppingItem,
} from "@/lib/actions/shopping-item"
import {
  createAlternative,
  updateAlternative,
  deleteAlternative,
  setPreferredAlternative,
} from "@/lib/actions/product-alternative"
import type { ShoppingItemData, AlternativeData } from "./item-list"
import type { Priority, Phase, ItemStatus } from "@workspace/db"
import { useMediaQuery } from "@/hooks/use-media-query"

interface EditItemDialogProps {
  item: ShoppingItemData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Array<{ id: string; name: string; icon: string | null; color: string | null }>
  members: Array<{ id: string; name: string; email: string }>
  listId: string
}

export function EditItemDialog({
  item,
  open,
  onOpenChange,
  categories,
  members,
}: EditItemDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [priority, setPriority] = useState<Priority>("MEDIUM")
  const [phase, setPhase] = useState("")
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [assignedToId, setAssignedToId] = useState("")
  const [status, setStatus] = useState<ItemStatus>("PENDING")

  // Sync form when item changes
  useEffect(() => {
    if (item) {
      setName(item.name)
      setDescription(item.description ?? "")
      setCategoryId(item.category?.id ?? "none")
      setPriority(item.priority)
      setPhase(item.phase ?? "none")
      setDueDate(item.dueDate ? new Date(item.dueDate) : undefined)
      setAssignedToId(item.assignedTo?.id ?? "none")
      setStatus(item.status)
      setError(null)
      setConfirmDelete(false)
    }
  }, [item])

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!item) return

    setError(null)

    startTransition(async () => {
      try {
        await updateShoppingItem({
          id: item.id,
          name: name.trim(),
          description: description.trim() || null,
          categoryId: categoryId && categoryId !== "none" ? categoryId : null,
          priority,
          phase: (phase && phase !== "none" ? phase : null) as Phase | null,
          dueDate: dueDate ?? null,
          assignedToId: assignedToId && assignedToId !== "none" ? assignedToId : null,
          status,
        })
        onOpenChange(false)
      } catch {
        setError("Noe gikk galt. Prov igjen.")
      }
    })
  }

  function handleDelete() {
    if (!item) return

    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    startDeleting(async () => {
      try {
        await deleteShoppingItem(item.id)
        onOpenChange(false)
      } catch {
        setError("Kunne ikke slette. Prov igjen.")
      }
    })
  }

  if (!item) return null

  const formContent = (
        <form onSubmit={handleSave} className="grid min-w-0 gap-4">
          <AlternativesCarouselSection
            itemId={item.id}
            alternatives={item.alternatives}
            disabled={isPending}
          />

          <Separator />

          <div className="grid gap-1.5">
            <Label htmlFor="edit-name">Navn *</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isPending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-description">Beskrivelse</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
              rows={2}
            />
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Kategori</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Velg..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span className="flex items-center gap-1.5">
                        {cat.icon && <CategoryIcon name={cat.icon} className="h-3.5 w-3.5" />}
                        {cat.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Prioritet</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">Hoy</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Lav</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Fase</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Velg..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen</SelectItem>
                  <SelectItem value="BEFORE_MOVE">For innflytting</SelectItem>
                  <SelectItem value="FIRST_WEEK">Forste uke</SelectItem>
                  <SelectItem value="CAN_WAIT">Kan vente</SelectItem>
                  <SelectItem value="NO_RUSH">Ingen hast</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ItemStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Ventende</SelectItem>
                  <SelectItem value="PURCHASED">Kjopt</SelectItem>
                  <SelectItem value="SKIPPED">Hoppet over</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Frist</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {dueDate
                    ? new Intl.DateTimeFormat("nb-NO", {
                        day: "numeric",
                        month: "short",
                      }).format(dueDate)
                    : "Velg..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
                  weekStartsOn={1}
                />
              </PopoverContent>
            </Popover>
          </div>

          {members.length > 1 && (
            <div className="grid gap-1.5">
              <Label>Tildelt til</Label>
              <Select value={assignedToId} onValueChange={setAssignedToId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Velg person..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isPending || isDeleting}
              className="w-full sm:w-auto"
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" data-icon="inline-start" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" data-icon="inline-start" />
              )}
              {confirmDelete ? "Bekreft sletting" : "Slett"}
            </Button>

            <div className="hidden flex-1 sm:block" />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              Avbryt
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={isPending || !name.trim()}
              className="w-full sm:w-auto"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" data-icon="inline-start" />
                  Lagrer...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" data-icon="inline-start" />
                  Lagre
                </>
              )}
            </Button>
          </div>
        </form>
  )

  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader className="sr-only">
            <SheetTitle>Rediger ting</SheetTitle>
          </SheetHeader>
          {formContent}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="sr-only">
          <DrawerTitle>Rediger ting</DrawerTitle>
        </DrawerHeader>
        <ScrollArea className="max-h-[70vh] overflow-x-hidden">
          <div className="min-w-0 px-4 pb-6">{formContent}</div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  )
}

// ─── Alternatives Carousel Section ────────────────────────────────

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

function AlternativesCarouselSection({
  itemId,
  alternatives,
  disabled,
}: {
  itemId: string
  alternatives: AlternativeData[]
  disabled: boolean
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const total = alternatives.length
  const safeCurrentIndex = total > 0 ? Math.min(currentIndex, total - 1) : 0

  function goNext() {
    setCurrentIndex((i) => (i + 1) % total)
  }

  function goPrev() {
    setCurrentIndex((i) => (i - 1 + total) % total)
  }

  function handleSetPreferred(alternativeId: string) {
    startTransition(async () => {
      await setPreferredAlternative(itemId, alternativeId)
      setCurrentIndex(0)
    })
  }

  function handleAddDone() {
    setIsAdding(false)
    // Navigate to the last existing alternative; the useEffect clamp
    // ensures index stays valid during the revalidation transition.
    setCurrentIndex(Math.max(total - 1, 0))
  }

  const current = total > 0 ? alternatives[safeCurrentIndex] : null
  const isSelected = safeCurrentIndex === 0 && total > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Produktalternativer</span>
          {total > 0 && (
          <Badge variant="secondary" className="text-[10px]">
              {safeCurrentIndex + 1} / {total}
          </Badge>
        )}
      </div>

      {/* Card area */}
      {total === 0 && !isAdding ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
          <p className="text-xs text-muted-foreground mb-3">
            Ingen produktalternativer enda. Legg til ulike produkter du
            vurderer.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
            disabled={disabled}
          >
            <Plus className="h-3.5 w-3.5" data-icon="inline-start" />
            Legg til produktalternativ
          </Button>
        </div>
      ) : isAdding ? (
        <AlternativeAddCard
          itemId={itemId}
          onDone={handleAddDone}
          onCancel={() => setIsAdding(false)}
        />
      ) : editingId && current && editingId === current.id ? (
        <AlternativeEditCard
          alternative={current}
          onDone={() => setEditingId(null)}
        />
      ) : current ? (
        <AlternativeViewCard
          alternative={current}
          isSelected={isSelected}
          onEdit={() => setEditingId(current.id)}
          onSelect={() => handleSetPreferred(current.id)}
          isPending={isPending || disabled}
        />
      ) : null}

      {/* Navigation */}
      {(total > 0 || isAdding) && (
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={goPrev}
            disabled={isPending || disabled || total <= 1 || isAdding || !!editingId}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1.5">
            {alternatives.map((alt, i) => (
              <button
                key={alt.id}
                type="button"
                onClick={() => {
                  setCurrentIndex(i)
                  setIsAdding(false)
                  setEditingId(null)
                }}
                disabled={isPending || disabled}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === safeCurrentIndex && !isAdding
                    ? "w-4 bg-primary"
                    : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                aria-label={`Vis alternativ ${i + 1}: ${alt.name}`}
              />
            ))}
            {/* Add button as dot */}
            <button
              type="button"
              onClick={() => {
                setIsAdding(true)
                setEditingId(null)
              }}
              disabled={isPending || disabled || isAdding}
              className={cn(
                "flex items-center justify-center rounded-full transition-all",
                isAdding
                  ? "h-4 w-4 bg-primary text-primary-foreground"
                  : "h-3 w-3 bg-muted-foreground/20 hover:bg-muted-foreground/40"
              )}
              aria-label="Legg til nytt produktalternativ"
            >
              <Plus className="h-2 w-2" />
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={goNext}
            disabled={isPending || disabled || total <= 1 || isAdding || !!editingId}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── View Card ─────────────────────────────────────────────────

function AlternativeViewCard({
  alternative,
  isSelected,
  onEdit,
  onSelect,
  isPending,
}: {
  alternative: AlternativeData
  isSelected: boolean
  onEdit: () => void
  onSelect: () => void
  isPending: boolean
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Image area */}
      {alternative.imageUrl ? (
        <div className="relative aspect-[16/10] bg-muted">
          <img
            key={alternative.id}
            src={alternative.imageUrl}
            alt={alternative.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
          />
          {isSelected && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-primary text-primary-foreground text-[10px] gap-1">
                <Check className="h-3 w-3" />
                Valgt
              </Badge>
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex items-center justify-center aspect-[16/10] bg-muted/50">
          <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
          {isSelected && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-primary text-primary-foreground text-[10px] gap-1">
                <Check className="h-3 w-3" />
                Valgt
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{alternative.name}</p>
            {alternative.storeName && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <Store className="h-3 w-3" />
                {alternative.storeName}
              </p>
            )}
          </div>
          {alternative.price != null && alternative.price > 0 && (
            <span className="text-sm font-bold tabular-nums shrink-0">
              {formatCurrency(alternative.price)}
            </span>
          )}
        </div>

        {alternative.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {alternative.notes}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {!isSelected && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={onSelect}
              disabled={isPending}
            >
              <Star className="h-3 w-3" data-icon="inline-start" />
              Velg denne
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onEdit}
            disabled={isPending}
          >
            Rediger
          </Button>
          {alternative.url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              asChild
            >
              <a
                href={alternative.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3" data-icon="inline-start" />
                Lenke
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Edit Card ─────────────────────────────────────────────────

function AlternativeEditCard({
  alternative,
  onDone,
}: {
  alternative: AlternativeData
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const [name, setName] = useState(alternative.name)
  const [price, setPrice] = useState(
    alternative.price != null ? String(alternative.price) : ""
  )
  const [url, setUrl] = useState(alternative.url ?? "")
  const [imageUrl, setImageUrl] = useState(alternative.imageUrl ?? "")
  const [storeName, setStoreName] = useState(alternative.storeName ?? "")
  const [notes, setNotes] = useState(alternative.notes ?? "")

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      await updateAlternative({
        id: alternative.id,
        name: name.trim(),
        price: price ? Number(price) : null,
        url: url.trim() || null,
        imageUrl: imageUrl.trim() || null,
        storeName: storeName.trim() || null,
        notes: notes.trim() || null,
      })
      onDone()
    })
  }

  function handleDelete() {
    startDeleting(async () => {
      await deleteAlternative(alternative.id)
      onDone()
    })
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Rediger produktalternativ</span>
        <button
          type="button"
          onClick={onDone}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Produktnavn *"
          className="h-8 text-sm"
          autoFocus
          disabled={isPending}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            type="number"
            min="0"
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Pris (kr)"
            className="h-8 text-sm"
            disabled={isPending}
          />
          <Input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="Butikk"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </div>
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Lenke (https://...)"
          className="h-8 text-sm"
          disabled={isPending}
        />
        <Input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="Bilde-URL (https://...)"
          className="h-8 text-sm"
          disabled={isPending}
        />
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notater"
          className="h-8 text-sm"
          disabled={isPending}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isPending || isDeleting}
            className="w-full sm:w-auto"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" data-icon="inline-start" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" data-icon="inline-start" />
            )}
            Slett
          </Button>
          <div className="hidden flex-1 sm:block" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDone}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Avbryt
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isPending || !name.trim()}
            className="w-full sm:w-auto"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" data-icon="inline-start" />
            ) : (
              <Save className="h-3.5 w-3.5" data-icon="inline-start" />
            )}
            Lagre
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Card ──────────────────────────────────────────────────

function AlternativeAddCard({
  itemId,
  onDone,
  onCancel,
}: {
  itemId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [url, setUrl] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [storeName, setStoreName] = useState("")
  const [notes, setNotes] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      await createAlternative({
        itemId,
        name: name.trim(),
        price: price ? Number(price) : undefined,
        url: url.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        storeName: storeName.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      onDone()
    })
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Nytt produktalternativ</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Produktnavn *"
          className="h-8 text-sm"
          autoFocus
          disabled={isPending}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            type="number"
            min="0"
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Pris (kr)"
            className="h-8 text-sm"
            disabled={isPending}
          />
          <Input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="Butikk"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </div>
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Lenke (https://...)"
          className="h-8 text-sm"
          disabled={isPending}
        />
        <Input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="Bilde-URL (https://...)"
          className="h-8 text-sm"
          disabled={isPending}
        />
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notater"
          className="h-8 text-sm"
          disabled={isPending}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="hidden flex-1 sm:block" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Avbryt
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={isPending || !name.trim()}
            className="w-full sm:w-auto"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" data-icon="inline-start" />
            ) : (
              <Plus className="h-3.5 w-3.5" data-icon="inline-start" />
            )}
            Legg til
          </Button>
        </div>
      </div>
    </div>
  )
}
