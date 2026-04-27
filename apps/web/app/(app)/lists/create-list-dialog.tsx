"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
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
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Plus, Loader2 } from "lucide-react"
import { createShoppingList } from "@/lib/actions/shopping-list"

export function CreateListDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [isPrivate, setIsPrivate] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    startTransition(async () => {
      const list = await createShoppingList({
        name: name.trim(),
        isPrivate,
      })
      setName("")
      setIsPrivate(false)
      setOpen(false)
      router.push(`/lists/${list.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Ny liste
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            Opprett ny handleliste
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="list-name">Navn på listen</Label>
            <Input
              id="list-name"
              placeholder="f.eks. Stue, Kjøkken, Bad..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={isPending}
            />
          </div>
          <label
            htmlFor="private-list"
            className="flex items-start gap-3 rounded-lg border p-3"
          >
            <Checkbox
              id="private-list"
              checked={isPrivate}
              onCheckedChange={(checked) => setIsPrivate(checked === true)}
              disabled={isPending}
            />
            <div className="space-y-1">
              <div className="text-sm font-medium">Privat liste</div>
              <p className="text-sm text-muted-foreground">
                Vises bare for deg og holdes utenfor husholdningens oversikter.
              </p>
            </div>
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Oppretter...
                </>
              ) : (
                "Opprett liste"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
