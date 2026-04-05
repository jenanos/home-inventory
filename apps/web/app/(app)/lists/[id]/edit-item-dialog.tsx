"use client"

import { useState, useEffect, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"
import {
  Loader2,
  CalendarIcon,
  Trash2,
  Save,
  Plus,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  X,
  Star,
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
  reorderAlternatives,
  setPreferredAlternative,
} from "@/lib/actions/product-alternative"
import type { ShoppingItemData, AlternativeData } from "./item-list"
import type { Priority, Phase, ItemStatus } from "@workspace/db"

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
  const [estimatedPrice, setEstimatedPrice] = useState("")
  const [url, setUrl] = useState("")
  const [storeName, setStoreName] = useState("")
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
      setEstimatedPrice(item.estimatedPrice != null ? String(item.estimatedPrice) : "")
      setUrl(item.url ?? "")
      setStoreName(item.storeName ?? "")
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
          estimatedPrice: estimatedPrice ? Number(estimatedPrice) : null,
          url: url.trim() || null,
          storeName: storeName.trim() || null,
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

  const formatDateDisplay = (date: Date) =>
    new Intl.DateTimeFormat("nb-NO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date)

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rediger ting</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="grid gap-4">
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

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-price">Estimert pris</Label>
              <Input
                id="edit-price"
                type="number"
                min="0"
                step="1"
                value={estimatedPrice}
                onChange={(e) => setEstimatedPrice(e.target.value)}
                placeholder="Kr"
                disabled={isPending}
              />
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
          </div>

          <Separator />

          <div className="grid gap-1.5">
            <Label htmlFor="edit-store">Butikk</Label>
            <Input
              id="edit-store"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="F.eks. IKEA"
              disabled={isPending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-url">Lenke</Label>
            <Input
              id="edit-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              disabled={isPending}
            />
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

          {item.status === "PENDING" && (
            <>
              <Separator />
              <AlternativesSection
                itemId={item.id}
                alternatives={item.alternatives}
                disabled={isPending}
              />
            </>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isPending || isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" data-icon="inline-start" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" data-icon="inline-start" />
              )}
              {confirmDelete ? "Bekreft sletting" : "Slett"}
            </Button>

            <div className="flex-1" />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Avbryt
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={isPending || !name.trim()}
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
      </DialogContent>
    </Dialog>
  )
}

// ─── Alternatives Section ────────────────────────────────────────

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

function AlternativesSection({
  itemId,
  alternatives,
  disabled,
}: {
  itemId: string
  alternatives: AlternativeData[]
  disabled: boolean
}) {
  const [isOpen, setIsOpen] = useState(alternatives.length > 0)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isReordering, startReorder] = useTransition()

  function handleMoveUp(index: number) {
    if (index === 0) return
    const ordered = alternatives.map((a) => a.id)
    ;[ordered[index - 1], ordered[index]] = [ordered[index]!, ordered[index - 1]!]
    startReorder(async () => {
      await reorderAlternatives(itemId, ordered)
    })
  }

  function handleMoveDown(index: number) {
    if (index === alternatives.length - 1) return
    const ordered = alternatives.map((a) => a.id)
    ;[ordered[index], ordered[index + 1]] = [ordered[index + 1]!, ordered[index]!]
    startReorder(async () => {
      await reorderAlternatives(itemId, ordered)
    })
  }

  function handleSetPreferred(alternativeId: string) {
    startReorder(async () => {
      await setPreferredAlternative(itemId, alternativeId)
    })
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between px-0 font-medium"
        >
          <span className="flex items-center gap-2">
            Alternativer
            {alternatives.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {alternatives.length}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3">
        {alternatives.length === 0 && !showAddForm && (
          <p className="text-xs text-muted-foreground py-1">
            Ingen alternativer enda. Legg til ulike produkter du vurderer.
          </p>
        )}

        {alternatives.map((alt, index) =>
          editingId === alt.id ? (
            <AlternativeEditForm
              key={alt.id}
              alternative={alt}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <div
              key={alt.id}
              className={cn(
                "group rounded-lg border p-3 transition-colors",
                index === 0
                  ? "border-primary/30 bg-primary/5 ring-1 ring-primary/20"
                  : "bg-muted/30 hover:bg-muted/50"
              )}
            >
              {/* Preferred badge for top alternative */}
              {index === 0 && (
                <div className="flex items-center gap-1.5 mb-2">
                  <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                  <span className="text-xs font-semibold text-primary">
                    Foretrukket
                  </span>
                </div>
              )}

              <div className="flex items-start gap-2.5">
                {/* Reorder controls */}
                <div className="flex flex-col items-center gap-0.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0 || isReordering || disabled}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Flytt opp"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === alternatives.length - 1 || isReordering || disabled}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Flytt ned"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Image */}
                {alt.imageUrl && (
                  <img
                    src={alt.imageUrl}
                    alt={alt.name}
                    className="h-12 w-12 rounded-md object-cover shrink-0"
                    onError={(e) => { e.currentTarget.style.display = "none" }}
                  />
                )}

                {/* Alternative details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col min-w-0">
                      <span className={cn(
                        "text-sm font-medium truncate",
                        index === 0 && "text-primary"
                      )}>
                        {alt.name}
                      </span>
                      {alt.storeName && (
                        <span className="text-xs text-muted-foreground">
                          {alt.storeName}
                        </span>
                      )}
                    </div>
                    {alt.price != null && alt.price > 0 && (
                      <span className={cn(
                        "text-sm font-semibold tabular-nums shrink-0",
                        index === 0 && "text-primary"
                      )}>
                        {formatCurrency(alt.price)}
                      </span>
                    )}
                  </div>

                  {alt.notes && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {alt.notes}
                    </p>
                  )}

                  {/* Action buttons row */}
                  <div className="flex items-center gap-2 mt-2">
                    {index !== 0 && (
                      <button
                        type="button"
                        onClick={() => handleSetPreferred(alt.id)}
                        disabled={isReordering || disabled}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-30"
                      >
                        <Star className="h-3 w-3" />
                        Sett som foretrukket
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingId(alt.id)}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Rediger
                    </button>
                    {alt.url && (
                      <a
                        href={alt.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Lenke
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {showAddForm ? (
          <AlternativeAddForm
            itemId={itemId}
            onDone={() => setShowAddForm(false)}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowAddForm(true)}
            disabled={disabled}
          >
            <Plus className="h-3.5 w-3.5" data-icon="inline-start" />
            Legg til alternativ
          </Button>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function AlternativeAddForm({
  itemId,
  onDone,
}: {
  itemId: string
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [url, setUrl] = useState("")
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
        storeName: storeName.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      onDone()
    })
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Nytt alternativ</span>
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
        <div className="grid grid-cols-2 gap-2">
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
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notater"
          className="h-8 text-sm"
          disabled={isPending}
        />
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={isPending || !name.trim()}
          className="w-full"
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
  )
}

function AlternativeEditForm({
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
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Rediger alternativ</span>
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
        <div className="grid grid-cols-2 gap-2">
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
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notater"
          className="h-8 text-sm"
          disabled={isPending}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isPending || isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" data-icon="inline-start" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" data-icon="inline-start" />
            )}
            Slett
          </Button>
          <div className="flex-1" />
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isPending || !name.trim()}
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
