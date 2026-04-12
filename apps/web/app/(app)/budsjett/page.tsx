import Link from "next/link"
import { requireHousehold } from "@/lib/session"
import { getBudget } from "@/lib/queries/budget"
import { ensureBudget } from "@/lib/actions/budget"
import { Button } from "@workspace/ui/components/button"
import { BotMessageSquare } from "lucide-react"
import { BudgetView } from "./budget-view"

function toNumber(d: unknown): number {
  return d != null ? Number(d) : 0
}

export default async function BudsjettPage() {
  const { membership } = await requireHousehold()

  // Ensure a budget exists for this household
  await ensureBudget()
  const budget = await getBudget(membership.householdId)
  if (!budget) throw new Error("Budget not found")

  const serialized = {
    id: budget.id,
    taxDeductionPercent: toNumber(budget.taxDeductionPercent),
    members: budget.members.map((m) => ({
      id: m.id,
      name: m.name,
      grossMonthlyIncome: toNumber(m.grossMonthlyIncome),
      taxPercent: toNumber(m.taxPercent),
    })),
    loans: budget.loans.map((l) => ({
      id: l.id,
      bankName: l.bankName,
      loanName: l.loanName,
      loanType: l.loanType,
      monthlyInterest: toNumber(l.monthlyInterest),
      monthlyPrincipal: toNumber(l.monthlyPrincipal),
      monthlyFees: toNumber(l.monthlyFees),
    })),
    trips: budget.trips.map((t) => ({
      id: t.id,
      name: t.name,
      transportType: t.transportType,
      annualTrips: t.annualTrips,
      ticketPerTrip: toNumber(t.ticketPerTrip),
      tollPerTrip: toNumber(t.tollPerTrip),
      ferryPerTrip: toNumber(t.ferryPerTrip),
      fuelPerTrip: toNumber(t.fuelPerTrip),
    })),
    entries: budget.entries.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      type: e.type,
      monthlyAmount: toNumber(e.monthlyAmount),
    })),
  }

  return (
    <div className="flex flex-col gap-6 overflow-x-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Budsjett
          </h1>
          <p className="text-muted-foreground text-sm">
            Oversikt over husstandens inntekter og kostnader
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/budsjett/llm-import">
            <BotMessageSquare className="h-4 w-4" data-icon="inline-start" />
            LLM-import
          </Link>
        </Button>
      </div>
      <BudgetView budget={serialized} />
    </div>
  )
}
