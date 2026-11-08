import {
  calculateLoanMonthlyAmounts,
  type BudgetLoanRepaymentType,
} from "../../budget-loan"

/*
 * The one budget calculation. The web page, the dashboard and MCP all use it,
 * so a number never differs between them. Inputs are loose (`Decimal`, string
 * or number) because the page passes plain numbers and the server passes
 * Prisma rows.
 */

type NumericValue = number | string | { toString(): string } | null | undefined

type BudgetEntryType = "INCOME" | "EXPENSE" | "DEDUCTION" | "SAVINGS" | string
type TripTransportType = "AIR_OR_PUBLIC" | "CAR" | string

export const BUDGET_FREQUENCIES = [
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "YEARLY",
] as const

export type BudgetFrequency = (typeof BUDGET_FREQUENCIES)[number]

/** Occurrences per year. */
const OCCURRENCES_PER_YEAR: Record<BudgetFrequency, number> = {
  WEEKLY: 52,
  MONTHLY: 12,
  QUARTERLY: 4,
  SEMIANNUAL: 2,
  YEARLY: 1,
}

export type BudgetCalculationCategory = {
  id: string
  name: string
}

export type BudgetCalculationEntry<
  TCategory extends BudgetCalculationCategory = BudgetCalculationCategory,
> = {
  type: BudgetEntryType
  amount: NumericValue
  /** Defaults to MONTHLY. */
  frequency?: BudgetFrequency | string | null
  category: TCategory | null
}

export type BudgetCalculationMember = {
  grossMonthlyIncome: NumericValue
  taxPercent: NumericValue
  netMonthlyIncome?: NumericValue
}

export type BudgetCalculationLoan = {
  loanType?: string | null
  principalAmount: NumericValue
  annualInterestRate: NumericValue
  termMonths: NumericValue
  repaymentType: BudgetLoanRepaymentType | string
  monthlyFees: NumericValue
}

export type BudgetCalculationTrip = {
  transportType: TripTransportType
  annualTrips: NumericValue
  ticketPerTrip: NumericValue
  tollPerTrip: NumericValue
  ferryPerTrip: NumericValue
  fuelPerTrip: NumericValue
  otherPerTrip?: NumericValue
}

export type BudgetCalculationInput<
  TCategory extends BudgetCalculationCategory = BudgetCalculationCategory,
  TEntry extends BudgetCalculationEntry<TCategory> =
    BudgetCalculationEntry<TCategory>,
> = {
  taxDeductionPercent: NumericValue
  propertyValue?: NumericValue
  categories: TCategory[]
  members: BudgetCalculationMember[]
  loans: BudgetCalculationLoan[]
  trips: BudgetCalculationTrip[]
  entries: TEntry[]
}

function toNumber(value: NumericValue): number {
  return value != null ? Number(value) : 0
}

function isSet(value: NumericValue) {
  return value != null && value !== ""
}

// ─── Row-level formulas, shared with the page and MCP ───────────

export function frequencyFactor(frequency: string | null | undefined) {
  const perYear =
    OCCURRENCES_PER_YEAR[(frequency ?? "MONTHLY") as BudgetFrequency] ?? 12
  return perYear / 12
}

/** What the entry amounts to per month, whatever its frequency. */
export function entryMonthlyAmount(entry: {
  amount: NumericValue
  frequency?: string | null
}) {
  return toNumber(entry.amount) * frequencyFactor(entry.frequency)
}

/** Expenses and savings leave the account; income and deductions add to it. */
function entryDisposableImpact(entry: BudgetCalculationEntry): number {
  const amount = entryMonthlyAmount(entry)
  return entry.type === "EXPENSE" || entry.type === "SAVINGS" ? -amount : amount
}

export function memberCalculatedNetIncome(member: BudgetCalculationMember) {
  return (
    toNumber(member.grossMonthlyIncome) *
    (1 - toNumber(member.taxPercent) / 100)
  )
}

/** The payout from the payslip when known, otherwise gross minus tax. */
export function memberNetIncome(member: BudgetCalculationMember) {
  return isSet(member.netMonthlyIncome)
    ? toNumber(member.netMonthlyIncome)
    : memberCalculatedNetIncome(member)
}

export function loanMonthlyAmounts(loan: BudgetCalculationLoan) {
  const amounts = calculateLoanMonthlyAmounts({
    principalAmount: toNumber(loan.principalAmount),
    annualInterestRate: toNumber(loan.annualInterestRate),
    termMonths: toNumber(loan.termMonths),
    repaymentType: loan.repaymentType === "SERIAL" ? "SERIAL" : "ANNUITY",
  })
  const fees = toNumber(loan.monthlyFees)

  return { ...amounts, fees, monthlyCost: amounts.monthlyPayment + fees }
}

export function tripCostPerTrip(trip: BudgetCalculationTrip) {
  const transport =
    trip.transportType === "AIR_OR_PUBLIC"
      ? toNumber(trip.ticketPerTrip)
      : toNumber(trip.tollPerTrip) +
        toNumber(trip.ferryPerTrip) +
        toNumber(trip.fuelPerTrip)

  return transport + toNumber(trip.otherPerTrip)
}

/** Yearly trip cost spread over twelve months. */
export function tripMonthlyCost(trip: BudgetCalculationTrip) {
  return (toNumber(trip.annualTrips) * tripCostPerTrip(trip)) / 12
}

// ─── The whole budget ───────────────────────────────────────────

function sumEntries(entries: BudgetCalculationEntry[], type: string) {
  return entries
    .filter((entry) => entry.type === type)
    .reduce((sum, entry) => sum + entryMonthlyAmount(entry), 0)
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
    (sum, member) => sum + memberNetIncome(member),
    0
  )

  const loanTotals = budget.loans.reduce(
    (totals, loan) => {
      const monthly = loanMonthlyAmounts(loan)
      const principal = toNumber(loan.principalAmount)

      totals.interest += monthly.monthlyInterest
      totals.principal += monthly.monthlyPrincipal
      totals.fees += monthly.fees
      totals.debt += principal
      if ((loan.loanType ?? "MORTGAGE") === "MORTGAGE") {
        totals.mortgageDebt += principal
      }
      return totals
    },
    { interest: 0, principal: 0, fees: 0, debt: 0, mortgageDebt: 0 }
  )
  const totalLoanCost =
    loanTotals.interest + loanTotals.principal + loanTotals.fees

  const totalTripCost = budget.trips.reduce(
    (sum, trip) => sum + tripMonthlyCost(trip),
    0
  )

  const monthlyTaxDeduction =
    loanTotals.interest * (toNumber(budget.taxDeductionPercent) / 100)

  const uncategorizedEntries = budget.entries.filter((entry) => !entry.category)
  const categoryGroups = budget.categories.map((category) => {
    const entries = budget.entries.filter(
      (entry) => entry.category?.id === category.id
    )

    return {
      category,
      entries,
      disposableImpact: entries.reduce(
        (sum, entry) => sum + entryDisposableImpact(entry),
        0
      ),
    }
  })

  const entryIncome = sumEntries(budget.entries, "INCOME")
  const entryExpenses = sumEntries(budget.entries, "EXPENSE")
  const entryDeductions = sumEntries(budget.entries, "DEDUCTION")
  const totalSavings = sumEntries(budget.entries, "SAVINGS")

  const totalIncome = totalNetIncome + entryIncome
  const totalNonLoanExpenses = totalTripCost + entryExpenses
  const totalExpenses = totalLoanCost + totalNonLoanExpenses
  const totalDeductions = monthlyTaxDeduction + entryDeductions
  const disposable =
    totalIncome - totalExpenses - totalSavings + totalDeductions

  // Paying down a loan builds equity, so it counts as saving alongside the
  // money set aside explicitly.
  const savingsIncludingPrincipal = totalSavings + loanTotals.principal
  const annualGrossIncome = totalGrossIncome * 12
  const propertyValue = toNumber(budget.propertyValue)

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
    totalSavings,
    totalDeductions,
    disposable,
    savingsIncludingPrincipal,
    totalDebt: loanTotals.debt,
    mortgageDebt: loanTotals.mortgageDebt,
    /** Percent of income saved, principal included; null without income. */
    savingsRate:
      totalIncome > 0 ? (savingsIncludingPrincipal / totalIncome) * 100 : null,
    /** Total debt as a multiple of gross yearly salary; null without salary. */
    debtToIncomeRatio:
      annualGrossIncome > 0 && loanTotals.debt > 0
        ? loanTotals.debt / annualGrossIncome
        : null,
    /** Mortgage debt as a percentage of the home's value; null if unknown. */
    loanToValue:
      propertyValue > 0 && loanTotals.mortgageDebt > 0
        ? (loanTotals.mortgageDebt / propertyValue) * 100
        : null,
    categoryGroups,
    uncategorizedEntries,
    uncategorizedImpact: uncategorizedEntries.reduce(
      (sum, entry) => sum + entryDisposableImpact(entry),
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
