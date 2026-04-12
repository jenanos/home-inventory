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
import { Pencil, Loader2 } from "lucide-react"
import { updateShoppingList } from "@/lib/actions/shopping-list"

interface RenameListDialogProps {
  listId: string
  currentName: string
}

export function RenameListDialog({ listId, currentName }: RenameListDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(currentName)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || name.trim() === currentName) return

    startTransition(async () => {
      await updateShoppingList(listId, name.trim())
      setOpen(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) setName(currentName)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => e.preventDefault()}
        >
          <Pencil className="h-3.5 w-3.5" />
          <span className="sr-only">Endre navn</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            Endre listenavn
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rename-list">Nytt navn</Label>
            <Input
              id="rename-list"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={isPending}
            />
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
            <Button
              type="submit"
              disabled={isPending || !name.trim() || name.trim() === currentName}
            >
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
