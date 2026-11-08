"use client"

import { useState, useTransition } from "react"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { upsertBudgetCategory } from "@/lib/actions/budget"
import { toast } from "sonner"
import { BudgetFormSheet, FormActions } from "./budget-form-sheet"

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
  return (
    <BudgetFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? "Rediger kategori" : "Legg til kategori"}
    >
      {open ? (
        <CategoryDialogForm
          key={category?.id ?? "new"}
          category={category}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </BudgetFormSheet>
  )
}

function CategoryDialogForm({
  category,
  onOpenChange,
}: {
  category: BudgetCategoryData | null
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState(category?.name ?? "")
  const [isPending, startTransition] = useTransition()

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

  return (
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
      <FormActions
        onCancel={() => onOpenChange(false)}
        isPending={isPending}
        submitLabel={category ? "Lagre" : "Legg til"}
      />
    </form>
  )
}
