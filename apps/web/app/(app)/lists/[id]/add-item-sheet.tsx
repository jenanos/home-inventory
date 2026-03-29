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
} from "lucide-react"
import { CategoryIcon } from "@/components/category-icon"
import { createShoppingItem } from "@/lib/actions/shopping-item"
import type { Priority, Phase } from "@workspace/db"
import { useMediaQuery } from "@/hooks/use-media-query"

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
  const [estimatedPrice, setEstimatedPrice] = useState("")
  const [url, setUrl] = useState("")
  const [storeName, setStoreName] = useState("")
  const [assignedToId, setAssignedToId] = useState("")

  function resetForm() {
    setName("")
    setDescription("")
    setCategoryId("")
    setPriority("MEDIUM")
    setPhase("")
    setDueDate(undefined)
    setEstimatedPrice("")
    setUrl("")
    setStoreName("")
    setAssignedToId("")
    setError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const normalizedCategoryId =
      categoryId && categoryId !== "none" ? categoryId : undefined
    const normalizedPhase = phase && phase !== "none" ? (phase as Phase) : undefined
    const normalizedAssignedToId =
      assignedToId && assignedToId !== "none" ? assignedToId : undefined

    startTransition(async () => {
      try {
        await createShoppingItem({
          name: name.trim(),
          description: description.trim() || undefined,
          categoryId: normalizedCategoryId,
          priority,
          phase: normalizedPhase,
          dueDate: dueDate || undefined,
          estimatedPrice: estimatedPrice ? Number(estimatedPrice) : undefined,
          url: url.trim() || undefined,
          storeName: storeName.trim() || undefined,
          assignedToId: normalizedAssignedToId,
          listId,
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

  const formContent = (
    <form onSubmit={handleSubmit} className="grid gap-4 px-4 pb-4">
      <div className="grid gap-1.5">
        <Label htmlFor="item-name">Navn *</Label>
        <Input
          id="item-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="F.eks. Spisebord"
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
          <Label htmlFor="item-price">Estimert pris</Label>
          <Input
            id="item-price"
            type="number"
            min="0"
            step="1"
            value={estimatedPrice}
            onChange={(e) => setEstimatedPrice(e.target.value)}
            placeholder="Kr"
            disabled={isPending}
          />
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

      <Separator />

      <div className="grid gap-1.5">
        <Label htmlFor="item-store">Butikk</Label>
        <Input
          id="item-store"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="F.eks. IKEA"
          disabled={isPending}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="item-url">Lenke</Label>
        <Input
          id="item-url"
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
