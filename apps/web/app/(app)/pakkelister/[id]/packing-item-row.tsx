"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Badge } from "@workspace/ui/components/badge"
import { Loader2, MoreHorizontal, Pencil, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { deletePackingItems, updatePackingItem } from "@/lib/actions/packing"
import type { PackingPersonOption } from "../persons-dialog"

const SHARED = "__shared__"

export type PackingItemView = {
  id: string
  name: string
  quantity: number
  notes: string | null
  packed: boolean
  personId: string | null
  personName: string | null
}

export function PackingItemRow({
  item,
  persons,
  showPerson,
  onToggle,
}: {
  item: PackingItemView
  persons: PackingPersonOption[]
  /** Off when the section or the filter already says who it is for. */
  showPerson: boolean
  onToggle: (packed: boolean) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const checkboxId = `item-${item.id}`

  function handleDelete() {
    startTransition(async () => {
      const result = await deletePackingItems([item.id])
      if (!result.ok) toast.error(result.error)
      router.refresh()
    })
  }

  return (
    <li className="flex items-center gap-1">
      <label
        htmlFor={checkboxId}
        className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 hover:bg-muted/50"
      >
        <Checkbox
          id={checkboxId}
          className="size-5"
          checked={item.packed}
          onCheckedChange={(checked) => onToggle(checked === true)}
        />
        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              "text-sm break-words",
              item.packed && "text-muted-foreground line-through"
            )}
          >
            {item.name}
            {item.quantity > 1 && (
              <span className="text-muted-foreground tabular-nums">
                {" "}
                × {item.quantity}
              </span>
            )}
            {showPerson && item.personName && (
              <Badge variant="secondary" className="ml-2 align-middle text-xs">
                {item.personName}
              </Badge>
            )}
          </span>
          {item.notes && (
            <span className="text-xs break-words text-muted-foreground">
              {item.notes}
            </span>
          )}
        </span>
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label={`Handlinger for ${item.name}`}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Rediger
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Fjern fra listen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && (
        <EditItemDialog
          item={item}
          persons={persons}
          onClose={() => setEditing(false)}
        />
      )}
    </li>
  )
}

function EditItemDialog({
  item,
  persons,
  onClose,
}: {
  item: PackingItemView
  persons: PackingPersonOption[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(item.name)
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [notes, setNotes] = useState(item.notes ?? "")
  const [personId, setPersonId] = useState(item.personId ?? SHARED)
  const [error, setError] = useState("")

  function handleSave() {
    const count = Number(quantity)
    if (!name.trim()) {
      setError("Navn er påkrevd")
      return
    }
    if (!Number.isInteger(count) || count < 1) {
      setError("Antall må være et helt tall, minst 1")
      return
    }
    startTransition(async () => {
      const result = await updatePackingItem({
        id: item.id,
        name: name.trim(),
        quantity: count,
        notes: notes.trim() || null,
        personId: personId === SHARED ? null : personId,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rediger ting</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
        >
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="packing-item-name">Navn</Label>
            <Input
              id="packing-item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="packing-item-quantity">Antall</Label>
            <Input
              id="packing-item-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          {persons.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Til</Label>
              <Select value={personId} onValueChange={setPersonId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SHARED}>Felles</SelectItem>
                  {persons.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="packing-item-notes">Notat</Label>
            <Input
              id="packing-item-notes"
              placeholder="F.eks. ligger i boden"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Lagre
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
