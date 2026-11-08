"use client"

import { useState, useTransition } from "react"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { upsertBudgetMember } from "@/lib/actions/budget"
import { memberCalculatedNetIncome } from "@/lib/application/budget/calculations"
import { toast } from "sonner"
import type { BudgetMemberData } from "./budget-view"
import { BudgetFormSheet, FormActions } from "./budget-form-sheet"
import {
  formatCurrency,
  optionalString,
  parseOptionalNumber,
} from "./budget-format"
import { MoreDetails } from "./more-details"

interface MemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: BudgetMemberData | null
}

export function MemberDialog({
  open,
  onOpenChange,
  member,
}: MemberDialogProps) {
  return (
    <BudgetFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={member ? "Rediger medlem" : "Legg til medlem"}
    >
      {open ? (
        <MemberForm
          key={member?.id ?? "new"}
          member={member}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </BudgetFormSheet>
  )
}

function MemberForm({
  member,
  onOpenChange,
}: {
  member: BudgetMemberData | null
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState(member?.name ?? "")
  const [grossIncome, setGrossIncome] = useState(
    member ? String(member.grossMonthlyIncome) : ""
  )
  const [taxPercent, setTaxPercent] = useState(
    member ? String(member.taxPercent) : ""
  )
  const [netIncome, setNetIncome] = useState(
    member?.netMonthlyIncome != null ? String(member.netMonthlyIncome) : ""
  )
  const [notes, setNotes] = useState(member?.notes ?? "")
  const [isPending, startTransition] = useTransition()

  const gross = parseOptionalNumber(grossIncome)
  const tax = parseOptionalNumber(taxPercent)
  const actualNet = parseOptionalNumber(netIncome)
  const calculatedNet =
    gross !== null && tax !== null
      ? memberCalculatedNetIncome({
          grossMonthlyIncome: gross,
          taxPercent: tax,
        })
      : null
  const filledCount = [netIncome, notes].filter((v) => v.trim() !== "").length

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim() || gross === null || tax === null) {
      toast.error("Fyll inn navn, bruttoinntekt og skatteprosent")
      return
    }

    startTransition(async () => {
      try {
        await upsertBudgetMember({
          id: member?.id,
          name: name.trim(),
          grossMonthlyIncome: gross,
          taxPercent: tax,
          netMonthlyIncome: actualNet,
          notes: optionalString(notes),
        })
        toast.success(member ? "Medlem oppdatert" : "Medlem lagt til")
        onOpenChange(false)
      } catch {
        toast.error("Noe gikk galt")
      }
    })
  }

  return (
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
          step="any"
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
          step="any"
          min="0"
          max="100"
          value={taxPercent}
          onChange={(e) => setTaxPercent(e.target.value)}
          placeholder="F.eks. 33"
        />
      </div>
      {calculatedNet !== null && (
        <div className="flex flex-col gap-1 rounded-md bg-muted p-3 text-sm">
          <p>
            Beregnet netto månedsinntekt:{" "}
            <span
              className={
                actualNet === null
                  ? "font-bold text-green-600 dark:text-green-400"
                  : "line-through"
              }
            >
              {formatCurrency(calculatedNet)}
            </span>
          </p>
          {actualNet !== null && (
            <p>
              Budsjettet bruker utbetalt netto:{" "}
              <span className="font-bold text-green-600 dark:text-green-400">
                {formatCurrency(actualNet)}
              </span>
            </p>
          )}
        </div>
      )}

      <MoreDetails filledCount={filledCount}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="member-net">Utbetalt netto per måned (kr)</Label>
          <Input
            id="member-net"
            type="number"
            step="any"
            min="0"
            value={netIncome}
            onChange={(e) => setNetIncome(e.target.value)}
            placeholder="Fra lønnsslippen"
          />
          <p className="text-xs text-muted-foreground">
            Mer presist enn skatteprosenten når du har lønnsslippen. Brukes i
            stedet for beregnet netto.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="member-notes">Notat</Label>
          <Textarea
            id="member-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="F.eks. arbeidsgiver eller tabelltrekk"
            rows={3}
          />
        </div>
      </MoreDetails>

      <FormActions
        onCancel={() => onOpenChange(false)}
        isPending={isPending}
        submitLabel={member ? "Lagre" : "Legg til"}
      />
    </form>
  )
}
