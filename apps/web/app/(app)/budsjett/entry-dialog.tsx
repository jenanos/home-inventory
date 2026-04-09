"use client"

import { useState, useTransition, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@workspace/ui/components/dialog"
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
import type { BudgetCategory, BudgetEntryType } from "@workspace/db"
import type { BudgetEntryData } from "./budget-view"
import { CATEGORY_LABELS } from "./budget-view"

const ALL_CATEGORIES: BudgetCategory[] = [
  "ELECTRICITY",
  "MUNICIPAL_FEES",
  "INSURANCE",
  "HOME_MAINTENANCE",
  "TRANSPORT",
  "SUBSCRIPTIONS",
  "FOOD",
  "CHILDREN",
  "PERSONAL",
  "SAVINGS",
  "BUFFER",
]

interface EntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: BudgetEntryData | null
  defaults: { category?: BudgetCategory; type?: BudgetEntryType }
}

export function EntryDialog({
  open,
  onOpenChange,
  entry,
  defaults,
}: EntryDialogProps) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState<BudgetCategory | "none">("none")
  const [type, setType] = useState<BudgetEntryType>("EXPENSE")
  const [monthlyAmount, setMonthlyAmount] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      if (entry) {
        setName(entry.name)
        setCategory(entry.category ?? "none")
        setType(entry.type)
        setMonthlyAmount(String(entry.monthlyAmount))
      } else {
        setName(
          defaults.category ? CATEGORY_LABELS[defaults.category] : ""
        )
        setCategory(defaults.category ?? "none")
        setType(defaults.type ?? "EXPENSE")
        setMonthlyAmount("")
      }
    }
  }, [open, entry, defaults])

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
          category: category === "none" ? null : category,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {entry ? "Rediger budsjettpost" : "Legg til budsjettpost"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              onValueChange={(v) => setType(v as BudgetEntryType)}
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
            <Select
              value={category}
              onValueChange={(v) =>
                setCategory(v as BudgetCategory | "none")
              }
            >
              <SelectTrigger id="entry-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen (manuell post)</SelectItem>
                {ALL_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
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
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={isPending}>
              {entry ? "Lagre" : "Legg til"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
