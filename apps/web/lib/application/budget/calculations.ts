import {
  calculateLoanMonthlyAmounts,
  type BudgetLoanRepaymentType,
} from "../../budget-loan"

type NumericValue = number | string | { toString(): string } | null | undefined

type BudgetEntryType = "INCOME" | "EXPENSE" | "DEDUCTION" | string
type TripTransportType = "AIR_OR_PUBLIC" | "CAR" | string

export type BudgetCalculationCategory = {
  id: string
  name: string
}

export type BudgetCalculationEntry<
  TCategory extends BudgetCalculationCategory = BudgetCalculationCategory,
> = {
  type: BudgetEntryType
  monthlyAmount: NumericValue
  category: TCategory | null
}

export type BudgetCalculationInput<
  TCategory extends BudgetCalculationCategory = BudgetCalculationCategory,
  TEntry extends BudgetCalculationEntry<TCategory> =
    BudgetCalculationEntry<TCategory>,
> = {
  taxDeductionPercent: NumericValue
  categories: TCategory[]
  members: Array<{
    grossMonthlyIncome: NumericValue
    taxPercent: NumericValue
  }>
  loans: Array<{
    principalAmount: NumericValue
    annualInterestRate: NumericValue
    termMonths: NumericValue
    repaymentType: BudgetLoanRepaymentType | string
    monthlyFees: NumericValue
  }>
  trips: Array<{
    transportType: TripTransportType
    annualTrips: NumericValue
    ticketPerTrip: NumericValue
    tollPerTrip: NumericValue
    ferryPerTrip: NumericValue
    fuelPerTrip: NumericValue
  }>
  entries: TEntry[]
}

function toNumber(value: NumericValue): number {
  return value != null ? Number(value) : 0
}

function getEntryDisposableImpact(entry: BudgetCalculationEntry): number {
  const amount = toNumber(entry.monthlyAmount)
  return entry.type === "EXPENSE" ? -amount : amount
}

export function calculateBudgetOverview<
  TCategory extends BudgetCalculationCategory,
  TEntry extends BudgetCalculationEntry<TCategory>,
>(budget: BudgetCalculationInput<TCategory, TEntry>) {
  const totalGrossIncome = budget.members.reduce(
    (sum, member) => sum + toNumber(member.grossMonthlyIncome),
    0
  )
  const totalNetIncome = budget.members.reduce(
    (sum, member) =>
      sum +
      toNumber(member.grossMonthlyIncome) *
        (1 - toNumber(member.taxPercent) / 100),
    0
  )

  const loanTotals = budget.loans.reduce(
    (totals, loan) => {
      const monthly = calculateLoanMonthlyAmounts({
        principalAmount: toNumber(loan.principalAmount),
        annualInterestRate: toNumber(loan.annualInterestRate),
        termMonths: toNumber(loan.termMonths),
        repaymentType: loan.repaymentType === "SERIAL" ? "SERIAL" : "ANNUITY",
      })

      totals.interest += monthly.monthlyInterest
      totals.principal += monthly.monthlyPrincipal
      totals.fees += toNumber(loan.monthlyFees)
      return totals
    },
    { interest: 0, principal: 0, fees: 0 }
  )
  const totalLoanCost =
    loanTotals.interest + loanTotals.principal + loanTotals.fees

  const totalTripCost = budget.trips.reduce((sum, trip) => {
    const perTrip =
      trip.transportType === "AIR_OR_PUBLIC"
        ? toNumber(trip.ticketPerTrip)
        : toNumber(trip.tollPerTrip) +
          toNumber(trip.ferryPerTrip) +
          toNumber(trip.fuelPerTrip)

    return sum + (toNumber(trip.annualTrips) * perTrip) / 12
  }, 0)

  const monthlyTaxDeduction =
    (loanTotals.interest *
      12 *
      (toNumber(budget.taxDeductionPercent) / 100)) /
    12

  const uncategorizedEntries = budget.entries.filter((entry) => !entry.category)
  const categoryGroups = budget.categories.map((category) => {
    const entries = budget.entries.filter(
      (entry) => entry.category?.id === category.id
    )

    return {
      category,
      entries,
      disposableImpact: entries.reduce(
        (sum, entry) => sum + getEntryDisposableImpact(entry),
        0
      ),
    }
  })

  const entryIncome = budget.entries
    .filter((entry) => entry.type === "INCOME")
    .reduce((sum, entry) => sum + toNumber(entry.monthlyAmount), 0)
  const entryExpenses = budget.entries
    .filter((entry) => entry.type === "EXPENSE")
    .reduce((sum, entry) => sum + toNumber(entry.monthlyAmount), 0)
  const entryDeductions = budget.entries
    .filter((entry) => entry.type === "DEDUCTION")
    .reduce((sum, entry) => sum + toNumber(entry.monthlyAmount), 0)

  const totalIncome = totalNetIncome + entryIncome
  const totalNonLoanExpenses = totalTripCost + entryExpenses
  const totalExpenses = totalLoanCost + totalNonLoanExpenses
  const totalDeductions = monthlyTaxDeduction + entryDeductions
  const disposable = totalIncome - totalExpenses + totalDeductions

  return {
    hasBudget: true as const,
    currency: "NOK" as const,
    totalGrossIncome,
    totalNetIncome,
    totalLoanInterest: loanTotals.interest,
    totalLoanPrincipal: loanTotals.principal,
    totalLoanFees: loanTotals.fees,
    totalLoanCost,
    totalLoanPayments: totalLoanCost,
    totalTripCost,
    monthlyTaxDeduction,
    entryIncome,
    entryExpenses,
    entryDeductions,
    totalIncome,
    totalNonLoanExpenses,
    totalExpenses,
    totalDeductions,
    disposable,
    categoryGroups,
    uncategorizedEntries,
    uncategorizedImpact: uncategorizedEntries.reduce(
      (sum, entry) => sum + getEntryDisposableImpact(entry),
      0
    ),
    memberCount: budget.members.length,
    loanCount: budget.loans.length,
    tripCount: budget.trips.length,
    entryCount: budget.entries.length,
  }
}

export function calculateBudgetStats(budget?: BudgetCalculationInput | null) {
  if (!budget) {
    return {
      hasBudget: false as const,
      currency: "NOK" as const,
    }
  }

  return calculateBudgetOverview(budget)
}
