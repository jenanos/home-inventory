import { requireHousehold } from "@/lib/session"
import { getBudget } from "@/lib/queries/budget"
import { ensureBudget } from "@/lib/actions/budget"
import { BudgetView } from "./budget-view"
import { BudgetLlmImportDialog } from "./llm-import-dialog"

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
      monthlyInterest: toNumber(l.monthlyInterest),
      monthlyPrincipal: toNumber(l.monthlyPrincipal),
      monthlyFees: toNumber(l.monthlyFees),
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Budsjett
          </h1>
          <p className="text-muted-foreground text-sm">
            Oversikt over husstandens inntekter og kostnader
          </p>
        </div>
        <BudgetLlmImportDialog />
      </div>
      <BudgetView budget={serialized} />
    </div>
  )
}
