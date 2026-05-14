"use client"

import { useEffect, useState, useTransition } from "react"
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
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { upsertBudgetCategory } from "@/lib/actions/budget"
import { toast } from "sonner"
import { useMediaQuery } from "@/hooks/use-media-query"

interface BudgetCategoryData {
  id: string
  name: string
}

interface CategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: BudgetCategoryData | null
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
}: CategoryDialogProps) {
  const [name, setName] = useState("")
  const [isPending, startTransition] = useTransition()
  const isDesktop = useMediaQuery("(min-width: 768px)")

  useEffect(() => {
    if (!open) return

    setName(category?.name ?? "")
  }, [open, category])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error("Skriv inn et kategorinavn")
      return
    }

    startTransition(async () => {
      try {
        await upsertBudgetCategory({
          id: category?.id,
          name,
        })
        toast.success(category ? "Kategori oppdatert" : "Kategori lagt til")
        onOpenChange(false)
      } catch {
        toast.error("Kunne ikke lagre kategorien")
      }
    })
  }

  const title = category ? "Rediger kategori" : "Legg til kategori"

  const formContent = (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="category-name">Navn</Label>
        <Input
          id="category-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="F.eks. Bilutgifter"
        />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          className="w-full sm:w-auto"
        >
          Avbryt
        </Button>
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {category ? "Lagre" : "Legg til"}
        </Button>
      </div>
    </form>
  )

  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {formContent}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <ScrollArea className="max-h-[70vh] overflow-x-hidden">
          <div className="min-w-0 px-4 pb-6">{formContent}</div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  )
}
