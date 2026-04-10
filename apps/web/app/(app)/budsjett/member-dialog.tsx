"use client"

import { useState, useTransition, useEffect } from "react"
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
import { upsertBudgetMember } from "@/lib/actions/budget"
import { toast } from "sonner"
import type { BudgetMemberData } from "./budget-view"
import { useMediaQuery } from "@/hooks/use-media-query"

interface MemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: BudgetMemberData | null
}

export function MemberDialog({ open, onOpenChange, member }: MemberDialogProps) {
  const [name, setName] = useState("")
  const [grossIncome, setGrossIncome] = useState("")
  const [taxPercent, setTaxPercent] = useState("")
  const [isPending, startTransition] = useTransition()
  const isDesktop = useMediaQuery("(min-width: 768px)")

  useEffect(() => {
    if (open) {
      if (member) {
        setName(member.name)
        setGrossIncome(String(member.grossMonthlyIncome))
        setTaxPercent(String(member.taxPercent))
      } else {
        setName("")
        setGrossIncome("")
        setTaxPercent("")
      }
    }
  }, [open, member])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const gross = parseFloat(grossIncome)
    const tax = parseFloat(taxPercent)

    if (!name.trim() || isNaN(gross) || isNaN(tax)) {
      toast.error("Fyll inn alle feltene")
      return
    }

    startTransition(async () => {
      try {
        await upsertBudgetMember({
          id: member?.id,
          name: name.trim(),
          grossMonthlyIncome: gross,
          taxPercent: tax,
        })
        toast.success(member ? "Medlem oppdatert" : "Medlem lagt til")
        onOpenChange(false)
      } catch {
        toast.error("Noe gikk galt")
      }
    })
  }

  const netIncome =
    !isNaN(parseFloat(grossIncome)) && !isNaN(parseFloat(taxPercent))
      ? parseFloat(grossIncome) * (1 - parseFloat(taxPercent) / 100)
      : null

  const formatPreview = (amount: number) =>
    new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency: "NOK",
      maximumFractionDigits: 0,
    }).format(amount)

  const title = member ? "Rediger medlem" : "Legg til medlem"

  const formContent = (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="member-name">Navn</Label>
        <Input
          id="member-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="F.eks. Ola Nordmann"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="member-gross">Brutto månedsinntekt (kr)</Label>
        <Input
          id="member-gross"
          type="number"
          step="1"
          min="0"
          value={grossIncome}
          onChange={(e) => setGrossIncome(e.target.value)}
          placeholder="F.eks. 50000"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="member-tax">Skatteprosent (%)</Label>
        <Input
          id="member-tax"
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={taxPercent}
          onChange={(e) => setTaxPercent(e.target.value)}
          placeholder="F.eks. 33"
        />
      </div>
      {netIncome !== null && (
        <div className="bg-muted rounded-md p-3">
          <p className="text-sm">
            Beregnet netto månedsinntekt:{" "}
            <span className="font-bold text-green-600 dark:text-green-400">
              {formatPreview(netIncome)}
            </span>
          </p>
        </div>
      )}
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
          {member ? "Lagre" : "Legg til"}
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
