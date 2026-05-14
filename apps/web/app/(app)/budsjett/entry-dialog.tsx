"use client"

import { useState, useTransition } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { upsertBudgetEntry } from "@/lib/actions/budget"
import { toast } from "sonner"
import type { BudgetEntryType } from "@workspace/db"
import type { BudgetCategoryData, BudgetEntryData } from "./budget-view"
import { useMediaQuery } from "@/hooks/use-media-query"

interface EntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: BudgetEntryData | null
  categories: BudgetCategoryData[]
  defaults: { categoryId?: string | null; type?: BudgetEntryType }
}

export function EntryDialog({
  open,
  onOpenChange,
  entry,
  categories,
  defaults,
}: EntryDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const title = entry ? "Rediger budsjettpost" : "Legg til budsjettpost"
  const initialCategoryId =
    entry?.category?.id ??
    (defaults.categoryId &&
    categories.some((category) => category.id === defaults.categoryId)
      ? defaults.categoryId
      : null)
  const formKey = entry?.id ?? `${initialCategoryId ?? "none"}-${defaults.type ?? "EXPENSE"}-${open ? "open" : "closed"}`
  const formContent = open ? (
    <EntryDialogForm
      key={formKey}
      entry={entry}
      categories={categories}
      initialCategoryId={initialCategoryId}
      initialType={entry?.type ?? defaults.type ?? "EXPENSE"}
      onOpenChange={onOpenChange}
    />
  ) : null

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

function EntryDialogForm({
  entry,
  categories,
  initialCategoryId,
  initialType,
  onOpenChange,
}: {
  entry: BudgetEntryData | null
  categories: BudgetCategoryData[]
  initialCategoryId: string | null
  initialType: BudgetEntryType
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState(entry?.name ?? "")
  const [categoryId, setCategoryId] = useState<string>(
    initialCategoryId ?? "none"
  )
  const [type, setType] = useState<BudgetEntryType>(initialType)
  const [monthlyAmount, setMonthlyAmount] = useState(
    entry ? String(entry.monthlyAmount) : ""
  )
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(monthlyAmount)

    if (!name.trim() || isNaN(amount)) {
      toast.error("Fyll inn alle feltene")
      return
    }

    startTransition(async () => {
      try {
        await upsertBudgetEntry({
          id: entry?.id,
          name: name.trim(),
          categoryId: categoryId === "none" ? null : categoryId,
          type,
          monthlyAmount: amount,
        })
        toast.success(entry ? "Post oppdatert" : "Post lagt til")
        onOpenChange(false)
      } catch {
        toast.error("Noe gikk galt")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="entry-name">Navn</Label>
        <Input
          id="entry-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="F.eks. Strøm"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="entry-type">Type</Label>
        <Select
          value={type}
          onValueChange={(value) => setType(value as BudgetEntryType)}
        >
          <SelectTrigger id="entry-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EXPENSE">Kostnad</SelectItem>
            <SelectItem value="INCOME">Inntekt</SelectItem>
            <SelectItem value="DEDUCTION">Fradrag (negativ kostnad)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="entry-category">Kategori (valgfri)</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="entry-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Ingen (ukategorisert)</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="entry-amount">Beløp per måned (kr)</Label>
        <Input
          id="entry-amount"
          type="number"
          step="1"
          min="0"
          value={monthlyAmount}
          onChange={(e) => setMonthlyAmount(e.target.value)}
          placeholder="F.eks. 2000"
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
          {entry ? "Lagre" : "Legg til"}
        </Button>
      </div>
    </form>
  )
}
