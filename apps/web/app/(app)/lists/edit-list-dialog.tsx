"use client"

import { useState, useTransition } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Pencil, Loader2, Check } from "lucide-react"
import { updateShoppingList } from "@/lib/actions/shopping-list"
import {
  LIST_COLOR_PRESETS,
  type ListColorId,
  isListColorId,
} from "@/lib/list-colors"
import { cn } from "@workspace/ui/lib/utils"

interface EditListDialogProps {
  listId: string
  currentName: string
  currentColor: string | null
}

export function EditListDialog({
  listId,
  currentName,
  currentColor,
}: EditListDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(currentName)
  const [color, setColor] = useState<ListColorId>(
    isListColorId(currentColor) ? currentColor : "default"
  )
  const [isPending, startTransition] = useTransition()

  const initialColor: ListColorId = isListColorId(currentColor)
    ? currentColor
    : "default"
  const trimmedName = name.trim()
  const nameChanged = trimmedName.length > 0 && trimmedName !== currentName
  const colorChanged = color !== initialColor
  const canSubmit = (nameChanged || colorChanged) && trimmedName.length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    startTransition(async () => {
      await updateShoppingList(listId, {
        name: nameChanged ? trimmedName : undefined,
        color: colorChanged ? (color === "default" ? null : color) : undefined,
      })
      setOpen(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) {
          setName(currentName)
          setColor(initialColor)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => e.preventDefault()}
        >
          <Pencil className="h-3.5 w-3.5" />
          <span className="sr-only">Endre liste</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            Endre liste
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-list-name">Navn</Label>
            <Input
              id="edit-list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Farge</Label>
            <div className="flex flex-wrap gap-2">
              {LIST_COLOR_PRESETS.map((preset) => {
                const selected = preset.id === color
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setColor(preset.id)}
                    disabled={isPending}
                    aria-pressed={selected}
                    aria-label={preset.label}
                    title={preset.label}
                    className={cn(
                      "relative flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-foreground/15 transition-transform",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      selected && "scale-110 ring-2 ring-foreground/40"
                    )}
                    style={{ background: preset.swatch }}
                  >
                    {selected && (
                      <Check
                        className="h-4 w-4 text-white drop-shadow"
                        strokeWidth={3}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={isPending || !canSubmit}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Lagrer...
                </>
              ) : (
                "Lagre"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
