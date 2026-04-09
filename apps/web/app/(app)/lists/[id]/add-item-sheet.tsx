"use client"

import { useState, useTransition } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/drawer"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Badge } from "@workspace/ui/components/badge"
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
import { cn } from "@workspace/ui/lib/utils"
import {
  Plus,
  Loader2,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
  ImageIcon,
  Store,
} from "lucide-react"
import { CategoryIcon } from "@/components/category-icon"
import { createShoppingItem } from "@/lib/actions/shopping-item"
import type { Priority, Phase } from "@workspace/db"
import { useMediaQuery } from "@/hooks/use-media-query"

interface LocalAlternative {
  tempId: string
  name: string
  price: string
  url: string
  imageUrl: string
  storeName: string
  notes: string
}

function createEmptyAlternative(): LocalAlternative {
  return {
    tempId: crypto.randomUUID(),
    name: "",
    price: "",
    url: "",
    imageUrl: "",
    storeName: "",
    notes: "",
  }
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

interface AddItemSheetProps {
  listId: string
  categories: Array<{ id: string; name: string; icon: string | null; color: string | null }>
  members: Array<{ id: string; name: string; email: string }>
}

export function AddItemSheet({ listId, categories, members }: AddItemSheetProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isDesktop = useMediaQuery("(min-width: 640px)")

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [priority, setPriority] = useState<Priority>("MEDIUM")
  const [phase, setPhase] = useState("")
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [assignedToId, setAssignedToId] = useState("")

  // Alternatives state
  const [alternatives, setAlternatives] = useState<LocalAlternative[]>([])
  const [altIndex, setAltIndex] = useState(0)
  const [isAddingAlt, setIsAddingAlt] = useState(false)
  const [newAlt, setNewAlt] = useState<LocalAlternative>(createEmptyAlternative)

  function resetForm() {
    setName("")
    setDescription("")
    setCategoryId("")
    setPriority("MEDIUM")
    setPhase("")
    setDueDate(undefined)
    setAssignedToId("")
    setAlternatives([])
    setAltIndex(0)
    setIsAddingAlt(false)
    setNewAlt(createEmptyAlternative())
    setError(null)
  }

  function handleAddAlternative() {
    if (!newAlt.name.trim()) return
    setAlternatives((prev) => [...prev, { ...newAlt, tempId: crypto.randomUUID() }])
    setNewAlt(createEmptyAlternative())
    setIsAddingAlt(false)
    setAltIndex(alternatives.length)
  }

  function handleRemoveAlternative(tempId: string) {
    setAlternatives((prev) => prev.filter((a) => a.tempId !== tempId))
    setAltIndex((i) => Math.max(0, Math.min(i, alternatives.length - 2)))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const normalizedCategoryId =
      categoryId && categoryId !== "none" ? categoryId : undefined
    const normalizedPhase = phase && phase !== "none" ? (phase as Phase) : undefined
    const normalizedAssignedToId =
      assignedToId && assignedToId !== "none" ? assignedToId : undefined

    const alternativesInput = alternatives
      .filter((a) => a.name.trim())
      .map((a) => ({
        name: a.name.trim(),
        price: a.price ? Number(a.price) : undefined,
        url: a.url.trim() || undefined,
        imageUrl: a.imageUrl.trim() || undefined,
        storeName: a.storeName.trim() || undefined,
        notes: a.notes.trim() || undefined,
      }))

    startTransition(async () => {
      try {
        await createShoppingItem({
          name: name.trim(),
          description: description.trim() || undefined,
          categoryId: normalizedCategoryId,
          priority,
          phase: normalizedPhase,
          dueDate: dueDate || undefined,
          assignedToId: normalizedAssignedToId,
          listId,
          alternatives: alternativesInput.length > 0 ? alternativesInput : undefined,
        })
        resetForm()
        setOpen(false)
      } catch {
        setError("Noe gikk galt. Prov igjen.")
      }
    })
  }

  const formatDateDisplay = (date: Date) =>
    new Intl.DateTimeFormat("nb-NO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date)

  const trigger = (
    <Button size="sm">
      <Plus className="h-4 w-4" data-icon="inline-start" />
      Legg til
    </Button>
  )

  const currentAlt = alternatives[altIndex] ?? null

  const formContent = (
    <form onSubmit={handleSubmit} className="grid gap-4 px-4 pb-4">
      <div className="grid gap-1.5">
        <Label htmlFor="item-name">Navn *</Label>
        <Input
          id="item-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="F.eks. Grill"
          required
          autoFocus
          disabled={isPending}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="item-description">Beskrivelse</Label>
        <Textarea
          id="item-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Valgfri beskrivelse..."
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
                {dueDate ? formatDateDisplay(dueDate) : "Velg dato..."}
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

      <Separator />

      {/* ─── Product Alternatives Carousel ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Produktalternativer</span>
          {alternatives.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {altIndex + 1} / {alternatives.length}
            </Badge>
          )}
        </div>

        {alternatives.length === 0 && !isAddingAlt ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
            <p className="text-xs text-muted-foreground mb-3">
              Legg til produktalternativer du vurderer, f.eks. ulike modeller.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddingAlt(true)}
              disabled={isPending}
            >
              <Plus className="h-3.5 w-3.5" data-icon="inline-start" />
              Legg til produktalternativ
            </Button>
          </div>
        ) : isAddingAlt ? (
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Nytt produktalternativ</span>
              <button
                type="button"
                onClick={() => setIsAddingAlt(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid gap-2">
              <Input
                value={newAlt.name}
                onChange={(e) => setNewAlt({ ...newAlt, name: e.target.value })}
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
                  value={newAlt.price}
                  onChange={(e) => setNewAlt({ ...newAlt, price: e.target.value })}
                  placeholder="Pris (kr)"
                  className="h-8 text-sm"
                  disabled={isPending}
                />
                <Input
                  value={newAlt.storeName}
                  onChange={(e) => setNewAlt({ ...newAlt, storeName: e.target.value })}
                  placeholder="Butikk"
                  className="h-8 text-sm"
                  disabled={isPending}
                />
              </div>
              <Input
                type="url"
                value={newAlt.url}
                onChange={(e) => setNewAlt({ ...newAlt, url: e.target.value })}
                placeholder="Lenke (https://...)"
                className="h-8 text-sm"
                disabled={isPending}
              />
              <Input
                type="url"
                value={newAlt.imageUrl}
                onChange={(e) => setNewAlt({ ...newAlt, imageUrl: e.target.value })}
                placeholder="Bilde-URL (https://...)"
                className="h-8 text-sm"
                disabled={isPending}
              />
              <Input
                value={newAlt.notes}
                onChange={(e) => setNewAlt({ ...newAlt, notes: e.target.value })}
                placeholder="Notater"
                className="h-8 text-sm"
                disabled={isPending}
              />
              <div className="flex items-center gap-2">
                <div className="flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddingAlt(false)}
                >
                  Avbryt
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddAlternative}
                  disabled={!newAlt.name.trim()}
                >
                  <Plus className="h-3.5 w-3.5" data-icon="inline-start" />
                  Legg til
                </Button>
              </div>
            </div>
          </div>
        ) : currentAlt ? (
          <div className="rounded-lg border bg-card overflow-hidden">
            {/* Image area */}
            {currentAlt.imageUrl ? (
              <div className="relative aspect-[16/10] bg-muted">
                <img
                  src={currentAlt.imageUrl}
                  alt={currentAlt.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none"
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center aspect-[16/10] bg-muted/50">
                <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
              </div>
            )}

            <div className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{currentAlt.name}</p>
                  {currentAlt.storeName && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Store className="h-3 w-3" />
                      {currentAlt.storeName}
                    </p>
                  )}
                </div>
                {currentAlt.price && Number(currentAlt.price) > 0 && (
                  <span className="text-sm font-bold tabular-nums shrink-0">
                    {formatCurrency(Number(currentAlt.price))}
                  </span>
                )}
              </div>

              {currentAlt.notes && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {currentAlt.notes}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleRemoveAlternative(currentAlt.tempId)}
                >
                  <Trash2 className="h-3 w-3" data-icon="inline-start" />
                  Fjern
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Navigation */}
        {(alternatives.length > 0 || isAddingAlt) && (
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setAltIndex((i) => (i - 1 + alternatives.length) % alternatives.length)}
              disabled={isPending || alternatives.length <= 1 || isAddingAlt}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-1.5">
              {alternatives.map((alt, i) => (
                <button
                  key={alt.tempId}
                  type="button"
                  onClick={() => {
                    setAltIndex(i)
                    setIsAddingAlt(false)
                  }}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === altIndex && !isAddingAlt
                      ? "w-4 bg-primary"
                      : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  )}
                  aria-label={`Vis alternativ ${i + 1}: ${alt.name}`}
                />
              ))}
              <button
                type="button"
                onClick={() => setIsAddingAlt(true)}
                disabled={isAddingAlt}
                className={cn(
                  "flex items-center justify-center rounded-full transition-all",
                  isAddingAlt
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
              onClick={() => setAltIndex((i) => (i + 1) % alternatives.length)}
              disabled={isPending || alternatives.length <= 1 || isAddingAlt}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isPending || !name.trim()} className="w-full">
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" data-icon="inline-start" />
            Legger til...
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" data-icon="inline-start" />
            Legg til
          </>
        )}
      </Button>
    </form>
  )

  const handleOpenChange = (v: boolean) => {
    setOpen(v)
    if (!v) resetForm()
  }

  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Legg til ny ting</SheetTitle>
          </SheetHeader>
          {formContent}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Legg til ny ting</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto max-h-[70vh]">
          {formContent}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
