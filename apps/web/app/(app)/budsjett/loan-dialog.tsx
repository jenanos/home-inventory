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
import { toast } from "sonner"
import type { BudgetLoanType } from "@workspace/db"
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
  const [monthlyInterest, setMonthlyInterest] = useState("")
  const [monthlyPrincipal, setMonthlyPrincipal] = useState("")
  const [monthlyFees, setMonthlyFees] = useState("")
  const [isPending, startTransition] = useTransition()
  const isDesktop = useMediaQuery("(min-width: 768px)")

  useEffect(() => {
    if (open) {
      if (loan) {
        setBankName(loan.bankName)
        setLoanName(loan.loanName)
        setLoanType(loan.loanType)
        setMonthlyInterest(String(loan.monthlyInterest))
        setMonthlyPrincipal(String(loan.monthlyPrincipal))
        setMonthlyFees(String(loan.monthlyFees))
      } else {
        setBankName("")
        setLoanName("")
        setLoanType("MORTGAGE")
        setMonthlyInterest("")
        setMonthlyPrincipal("")
        setMonthlyFees("0")
      }
    }
  }, [open, loan])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const interest = parseFloat(monthlyInterest)
    const principal = parseFloat(monthlyPrincipal)
    const fees = parseFloat(monthlyFees) || 0

    if (
      !bankName.trim() ||
      !loanName.trim() ||
      isNaN(interest) ||
      isNaN(principal)
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
          monthlyInterest: interest,
          monthlyPrincipal: principal,
          monthlyFees: fees,
        })
        toast.success(loan ? "Lån oppdatert" : "Lån lagt til")
        onOpenChange(false)
      } catch {
        toast.error("Noe gikk galt")
      }
    })
  }

  const total =
    (parseFloat(monthlyInterest) || 0) +
    (parseFloat(monthlyPrincipal) || 0) +
    (parseFloat(monthlyFees) || 0)

  const formatPreview = (amount: number) =>
    new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency: "NOK",
      maximumFractionDigits: 0,
    }).format(amount)

  const title = loan ? "Rediger lån" : "Legg til lån"

  const formContent = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <p className="text-xs text-muted-foreground">
          Tips: legg inn én lånepost per bank dersom boliglånet er delt opp.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="loan-interest">Renter per måned (kr)</Label>
        <Input
          id="loan-interest"
          type="number"
          step="1"
          min="0"
          value={monthlyInterest}
          onChange={(e) => setMonthlyInterest(e.target.value)}
          placeholder="F.eks. 5000"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="loan-principal">Avdrag per måned (kr)</Label>
        <Input
          id="loan-principal"
          type="number"
          step="1"
          min="0"
          value={monthlyPrincipal}
          onChange={(e) => setMonthlyPrincipal(e.target.value)}
          placeholder="F.eks. 3000"
        />
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
      {total > 0 && (
        <div className="bg-muted rounded-md p-3">
          <p className="text-sm">
            Total månedskostnad:{" "}
            <span className="font-bold">{formatPreview(total)}</span>
          </p>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Avbryt
        </Button>
        <Button type="submit" disabled={isPending}>
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
        <ScrollArea className="max-h-[60vh] overflow-y-auto">
          <div className="px-4 pb-6">{formContent}</div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  )
}
