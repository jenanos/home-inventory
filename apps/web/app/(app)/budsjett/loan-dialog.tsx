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
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { upsertBudgetLoan } from "@/lib/actions/budget"
import { calculateLoanMonthlyAmounts } from "@/lib/budget-loan"
import { toast } from "sonner"
import type { BudgetLoanRepaymentType, BudgetLoanType } from "@workspace/db"
import type { BudgetLoanData } from "./budget-view"
import { useMediaQuery } from "@/hooks/use-media-query"

interface LoanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loan: BudgetLoanData | null
}

export function LoanDialog({ open, onOpenChange, loan }: LoanDialogProps) {
  const [bankName, setBankName] = useState("")
  const [loanName, setLoanName] = useState("")
  const [loanType, setLoanType] = useState<BudgetLoanType>("MORTGAGE")
  const [repaymentType, setRepaymentType] =
    useState<BudgetLoanRepaymentType>("ANNUITY")
  const [principalAmount, setPrincipalAmount] = useState("")
  const [annualInterestRate, setAnnualInterestRate] = useState("")
  const [termYears, setTermYears] = useState("")
  const [monthlyFees, setMonthlyFees] = useState("")
  const [isPending, startTransition] = useTransition()
  const isDesktop = useMediaQuery("(min-width: 768px)")

  useEffect(() => {
    if (open) {
      if (loan) {
        setBankName(loan.bankName)
        setLoanName(loan.loanName)
        setLoanType(loan.loanType)
        setRepaymentType(loan.repaymentType)
        setPrincipalAmount(loan.principalAmount > 0 ? String(loan.principalAmount) : "")
        setAnnualInterestRate(
          loan.annualInterestRate > 0 ? String(loan.annualInterestRate) : ""
        )
        setTermYears(loan.termMonths > 0 ? String(loan.termMonths / 12) : "")
        setMonthlyFees(String(loan.monthlyFees))
      } else {
        setBankName("")
        setLoanName("")
        setLoanType("MORTGAGE")
        setRepaymentType("ANNUITY")
        setPrincipalAmount("")
        setAnnualInterestRate("")
        setTermYears("")
        setMonthlyFees("0")
      }
    }
  }, [open, loan])

  const principalNum = parseFloat(principalAmount)
  const interestNum = parseFloat(annualInterestRate)
  const termYearsNum = parseFloat(termYears)
  const feesNum = parseFloat(monthlyFees)

  const termMonths =
    isFinite(termYearsNum) && termYearsNum > 0
      ? Math.max(1, Math.round(termYearsNum * 12))
      : 0

  const monthly = calculateLoanMonthlyAmounts({
    principalAmount: isFinite(principalNum) ? principalNum : 0,
    annualInterestRate: isFinite(interestNum) ? interestNum : 0,
    termMonths,
    repaymentType,
  })
  const feeForTotal = isFinite(feesNum) && feesNum > 0 ? feesNum : 0
  const totalMonthly = monthly.monthlyPayment + feeForTotal

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (
      !bankName.trim() ||
      !loanName.trim() ||
      !isFinite(principalNum) ||
      principalNum <= 0 ||
      !isFinite(interestNum) ||
      interestNum < 0 ||
      !isFinite(termYearsNum) ||
      termYearsNum <= 0
    ) {
      toast.error("Fyll inn alle obligatoriske feltene")
      return
    }

    const fees = isFinite(feesNum) && feesNum >= 0 ? feesNum : 0

    startTransition(async () => {
      try {
        await upsertBudgetLoan({
          id: loan?.id,
          bankName: bankName.trim(),
          loanName: loanName.trim(),
          loanType,
          repaymentType,
          principalAmount: principalNum,
          annualInterestRate: interestNum,
          termMonths,
          monthlyFees: fees,
        })
        toast.success(loan ? "Lån oppdatert" : "Lån lagt til")
        onOpenChange(false)
      } catch {
        toast.error("Noe gikk galt")
      }
    })
  }

  const formatPreview = (amount: number) =>
    new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency: "NOK",
      maximumFractionDigits: 0,
    }).format(amount)

  const title = loan ? "Rediger lån" : "Legg til lån"

  const formContent = (
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
              <SelectItem value="MORTGAGE">Boliglån</SelectItem>
              <SelectItem value="OTHER">Annet lån</SelectItem>
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
        <Label htmlFor="loan-principal">Lånebeløp / restgjeld (kr)</Label>
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
          <Label htmlFor="loan-term">Nedbetalingstid (år)</Label>
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
      {monthly.monthlyPayment > 0 && (
        <div className="flex flex-col gap-1 rounded-md bg-muted p-3 text-sm">
          <p>
            Beregnet månedlig betaling:{" "}
            <span className="font-bold">
              {formatPreview(monthly.monthlyPayment)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Renter {formatPreview(monthly.monthlyInterest)} · Avdrag{" "}
            {formatPreview(monthly.monthlyPrincipal)}
            {feeForTotal > 0 && <> · Gebyrer {formatPreview(feeForTotal)}</>}
          </p>
          <p>
            Total månedskostnad:{" "}
            <span className="font-bold">{formatPreview(totalMonthly)}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Årlig: {formatPreview(totalMonthly * 12)}
            {repaymentType === "SERIAL" && (
              <> · gjennomsnitt over nedbetalingstiden</>
            )}
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
          {loan ? "Lagre" : "Legg til"}
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
