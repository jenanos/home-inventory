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
import { cn } from "@workspace/ui/lib/utils"
import {
  Loader2,
  CalendarIcon,
  Trash2,
  Save,
} from "lucide-react"
import {
  updateShoppingItem,
  deleteShoppingItem,
} from "@/lib/actions/shopping-item"
import type { ShoppingItemData } from "./item-list"
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
                        {cat.icon && <span>{cat.icon}</span>}
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
