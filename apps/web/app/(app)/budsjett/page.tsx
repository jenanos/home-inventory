import { requireHousehold } from "@/lib/session"
import { getBudget } from "@/lib/queries/budget"
import { ensureBudget } from "@/lib/actions/budget"
import { formatDateToIsoDate } from "@/lib/application/serialization"
import { BudgetView, type BudgetData } from "./budget-view"

function toNumber(value: unknown): number {
  return value != null ? Number(value) : 0
}

function toOptionalNumber(value: unknown): number | null {
  return value != null ? Number(value) : null
}

function toDate(value: Date | null) {
  return value ? formatDateToIsoDate(value) : null
}

export default async function BudsjettPage() {
  const { context } = await requireHousehold()

  // Ensure a budget exists for this household
  await ensureBudget()
  const budget = await getBudget(context)
  if (!budget) throw new Error("Budget not found")

  const serialized: BudgetData = {
    id: budget.id,
    taxDeductionPercent: toNumber(budget.taxDeductionPercent),
    propertyValue: toOptionalNumber(budget.propertyValue),
    categories: budget.categories.map((category) => ({
      id: category.id,
      name: category.name,
    })),
    members: budget.members.map((m) => ({
      id: m.id,
      name: m.name,
      grossMonthlyIncome: toNumber(m.grossMonthlyIncome),
      taxPercent: toNumber(m.taxPercent),
      netMonthlyIncome: toOptionalNumber(m.netMonthlyIncome),
      notes: m.notes,
    })),
    loans: budget.loans.map((l) => ({
      id: l.id,
      bankName: l.bankName,
      loanName: l.loanName,
      loanType: l.loanType,
      repaymentType: l.repaymentType,
      principalAmount: toNumber(l.principalAmount),
      annualInterestRate: toNumber(l.annualInterestRate),
      termMonths: l.termMonths,
      monthlyFees: toNumber(l.monthlyFees),
      fixedRateUntil: toDate(l.fixedRateUntil),
      notes: l.notes,
    })),
    trips: budget.trips.map((t) => ({
      id: t.id,
      name: t.name,
      transportType: t.transportType,
      annualTrips: t.annualTrips,
      ticketPerTrip: toOptionalNumber(t.ticketPerTrip),
      tollPerTrip: toOptionalNumber(t.tollPerTrip),
      ferryPerTrip: toOptionalNumber(t.ferryPerTrip),
      fuelPerTrip: toOptionalNumber(t.fuelPerTrip),
      otherPerTrip: toOptionalNumber(t.otherPerTrip),
      notes: t.notes,
    })),
    entries: budget.entries.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category
        ? { id: e.category.id, name: e.category.name }
        : null,
      type: e.type,
      amount: toNumber(e.amount),
      frequency: e.frequency,
      provider: e.provider,
      paymentDay: e.paymentDay,
      renewalDate: toDate(e.renewalDate),
      notes: e.notes,
    })),
  }

  return (
    <div className="flex flex-col gap-6 overflow-x-hidden">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Budsjett
        </h1>
        <p className="text-sm text-muted-foreground">
          Oversikt over husstandens inntekter, kostnader og sparing
        </p>
      </div>
      <BudgetView budget={serialized} />
    </div>
  )
}
