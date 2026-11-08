"use client"

import { useState, useTransition } from "react"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { upsertBudgetLoan } from "@/lib/actions/budget"
import { loanMonthlyAmounts } from "@/lib/application/budget/calculations"
import { toast } from "sonner"
import type { BudgetLoanRepaymentType, BudgetLoanType } from "@workspace/db"
import type { BudgetLoanData } from "./budget-view"
import { BudgetFormSheet, FormActions } from "./budget-form-sheet"
import {
  LOAN_TYPE_LABELS,
  formatCurrency,
  optionalString,
  parseOptionalNumber,
} from "./budget-format"
import { MoreDetails } from "./more-details"

interface LoanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loan: BudgetLoanData | null
}

export function LoanDialog({ open, onOpenChange, loan }: LoanDialogProps) {
  return (
    <BudgetFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={loan ? "Rediger lån" : "Legg til lån"}
    >
      {open ? (
        <LoanForm
          key={loan?.id ?? "new"}
          loan={loan}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </BudgetFormSheet>
  )
}

function LoanForm({
  loan,
  onOpenChange,
}: {
  loan: BudgetLoanData | null
  onOpenChange: (open: boolean) => void
}) {
  const [bankName, setBankName] = useState(loan?.bankName ?? "")
  const [loanName, setLoanName] = useState(loan?.loanName ?? "")
  const [loanType, setLoanType] = useState<BudgetLoanType>(
    loan?.loanType ?? "MORTGAGE"
  )
  const [repaymentType, setRepaymentType] = useState<BudgetLoanRepaymentType>(
    loan?.repaymentType ?? "ANNUITY"
  )
  const [principalAmount, setPrincipalAmount] = useState(
    loan && loan.principalAmount > 0 ? String(loan.principalAmount) : ""
  )
  const [annualInterestRate, setAnnualInterestRate] = useState(
    loan ? String(loan.annualInterestRate) : ""
  )
  const [termYears, setTermYears] = useState(
    loan && loan.termMonths > 0 ? String(loan.termMonths / 12) : ""
  )
  const [monthlyFees, setMonthlyFees] = useState(
    loan ? String(loan.monthlyFees) : "0"
  )
  const [fixedRateUntil, setFixedRateUntil] = useState(
    loan?.fixedRateUntil ?? ""
  )
  const [notes, setNotes] = useState(loan?.notes ?? "")
  const [isPending, startTransition] = useTransition()

  const principal = parseOptionalNumber(principalAmount)
  const interest = parseOptionalNumber(annualInterestRate)
  const years = parseOptionalNumber(termYears)
  const fees = Math.max(0, parseOptionalNumber(monthlyFees) ?? 0)
  const termMonths =
    years !== null && years > 0 ? Math.max(1, Math.round(years * 12)) : 0
  const isMortgage = loanType === "MORTGAGE"

  const monthly = loanMonthlyAmounts({
    principalAmount: principal ?? 0,
    annualInterestRate: interest ?? 0,
    termMonths,
    repaymentType,
    monthlyFees: fees,
  })
  const filledCount = [isMortgage ? fixedRateUntil : "", notes].filter(
    (v) => v.trim() !== ""
  ).length

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (
      !bankName.trim() ||
      !loanName.trim() ||
      principal === null ||
      principal <= 0 ||
      interest === null ||
      interest < 0 ||
      termMonths <= 0
    ) {
      toast.error("Fyll inn alle obligatoriske feltene")
      return
    }

    startTransition(async () => {
      try {
        await upsertBudgetLoan({
          id: loan?.id,
          bankName: bankName.trim(),
          loanName: loanName.trim(),
          loanType,
          repaymentType,
          principalAmount: principal,
          annualInterestRate: interest,
          termMonths,
          monthlyFees: fees,
          fixedRateUntil: isMortgage && fixedRateUntil ? fixedRateUntil : null,
          notes: optionalString(notes),
        })
        toast.success(loan ? "Lån oppdatert" : "Lån lagt til")
        onOpenChange(false)
      } catch {
        toast.error("Noe gikk galt")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="loan-bank">Bank</Label>
          <Input
            id="loan-bank"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="F.eks. DNB"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="loan-name">Lånenavn</Label>
          <Input
            id="loan-name"
            value={loanName}
            onChange={(e) => setLoanName(e.target.value)}
            placeholder="F.eks. Boliglån del 2"
          />
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="loan-type">Lånetype</Label>
          <Select
            value={loanType}
            onValueChange={(v) => setLoanType(v as BudgetLoanType)}
          >
            <SelectTrigger id="loan-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LOAN_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="loan-repayment">Nedbetalingstype</Label>
          <Select
            value={repaymentType}
            onValueChange={(v) =>
              setRepaymentType(v as BudgetLoanRepaymentType)
            }
          >
            <SelectTrigger id="loan-repayment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANNUITY">Annuitetslån</SelectItem>
              <SelectItem value="SERIAL">Serielån</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Tips: legg inn én lånepost per bank dersom boliglånet er delt opp. Bruk
        dagens restgjeld og gjenværende nedbetalingstid for eksisterende lån.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="loan-principal">Restgjeld (kr)</Label>
        <Input
          id="loan-principal"
          type="number"
          step="1"
          min="0"
          value={principalAmount}
          onChange={(e) => setPrincipalAmount(e.target.value)}
          placeholder="F.eks. 3000000"
        />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="loan-interest">Årlig rente (%)</Label>
          <Input
            id="loan-interest"
            type="number"
            step="0.01"
            min="0"
            value={annualInterestRate}
            onChange={(e) => setAnnualInterestRate(e.target.value)}
            placeholder="F.eks. 5.5"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="loan-term">Gjenværende nedbetalingstid (år)</Label>
          <Input
            id="loan-term"
            type="number"
            step="0.5"
            min="0"
            value={termYears}
            onChange={(e) => setTermYears(e.target.value)}
            placeholder="F.eks. 25"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="loan-fees">Gebyrer per måned (kr)</Label>
        <Input
          id="loan-fees"
          type="number"
          step="1"
          min="0"
          value={monthlyFees}
          onChange={(e) => setMonthlyFees(e.target.value)}
          placeholder="F.eks. 50"
        />
      </div>

      <MoreDetails filledCount={filledCount}>
        {isMortgage && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="loan-fixed-until">Fastrente til</Label>
            <Input
              id="loan-fixed-until"
              type="date"
              value={fixedRateUntil}
              onChange={(e) => setFixedRateUntil(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              La stå tomt for flytende rente.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="loan-notes">Notat</Label>
          <Textarea
            id="loan-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </MoreDetails>

      {monthly.monthlyPayment > 0 && (
        <div className="flex flex-col gap-1 rounded-md bg-muted p-3 text-sm">
          <p>
            Betaling denne måneden:{" "}
            <span className="font-bold">
              {formatCurrency(monthly.firstPayment + fees)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Snitt neste 12 måneder: renter{" "}
            {formatCurrency(monthly.monthlyInterest)} · avdrag{" "}
            {formatCurrency(monthly.monthlyPrincipal)}
            {fees > 0 && <> · gebyrer {formatCurrency(fees)}</>}
          </p>
          <p>
            Månedskostnad i budsjettet:{" "}
            <span className="font-bold">
              {formatCurrency(monthly.monthlyCost)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Gjenstående renter over hele løpetiden:{" "}
            {formatCurrency(monthly.remainingInterest)}
          </p>
        </div>
      )}

      <FormActions
        onCancel={() => onOpenChange(false)}
        isPending={isPending}
        submitLabel={loan ? "Lagre" : "Legg til"}
      />
    </form>
  )
}
