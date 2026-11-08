"use client"

import { useState, useTransition } from "react"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { updateBudgetSettings } from "@/lib/actions/budget"
import { toast } from "sonner"
import { BudgetFormSheet, FormActions } from "./budget-form-sheet"
import { parseOptionalNumber } from "./budget-format"

export function SettingsDialog({
  open,
  onOpenChange,
  taxDeductionPercent,
  propertyValue,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  taxDeductionPercent: number
  propertyValue: number | null
}) {
  return (
    <BudgetFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Budsjettinnstillinger"
    >
      {open ? (
        <SettingsForm
          taxDeductionPercent={taxDeductionPercent}
          propertyValue={propertyValue}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </BudgetFormSheet>
  )
}

function SettingsForm({
  taxDeductionPercent,
  propertyValue,
  onOpenChange,
}: {
  taxDeductionPercent: number
  propertyValue: number | null
  onOpenChange: (open: boolean) => void
}) {
  const [deduction, setDeduction] = useState(String(taxDeductionPercent))
  const [value, setValue] = useState(
    propertyValue != null ? String(propertyValue) : ""
  )
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const percent = parseOptionalNumber(deduction)
    const property = parseOptionalNumber(value)

    if (percent === null || percent < 0 || percent > 100) {
      toast.error("Rentefradraget må være mellom 0 og 100 %")
      return
    }
    if (property !== null && property < 0) {
      toast.error("Boligverdien kan ikke være negativ")
      return
    }

    startTransition(async () => {
      try {
        await updateBudgetSettings({
          taxDeductionPercent: percent,
          propertyValue: property,
        })
        toast.success("Innstillinger lagret")
        onOpenChange(false)
      } catch {
        toast.error("Kunne ikke lagre innstillingene")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-deduction">Rentefradrag (%)</Label>
        <Input
          id="settings-deduction"
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={deduction}
          onChange={(e) => setDeduction(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Andelen av rentekostnadene som trekkes fra skatten. 22 % i Norge.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-property">Boligverdi (kr)</Label>
        <Input
          id="settings-property"
          type="number"
          step="1"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="F.eks. 5500000"
        />
        <p className="text-xs text-muted-foreground">
          Valgfritt. Gir belåningsgrad for boliglånet.
        </p>
      </div>
      <FormActions
        onCancel={() => onOpenChange(false)}
        isPending={isPending}
        submitLabel="Lagre"
      />
    </form>
  )
}
