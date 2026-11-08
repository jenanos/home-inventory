import { z } from "zod"

import {
  calculateBudgetStats,
  entryMonthlyAmount,
  loanMonthlyAmounts,
  memberNetIncome,
  tripMonthlyCost,
} from "../../application/budget/calculations"
import {
  BUDGET_ENTRY_OPTIONAL_FIELDS,
  BUDGET_LOAN_OPTIONAL_FIELDS,
  BUDGET_MEMBER_OPTIONAL_FIELDS,
  BUDGET_SETTINGS_OPTIONAL_FIELDS,
  BUDGET_TRIP_OPTIONAL_FIELDS,
  missingFieldKeys,
} from "../../application/budget/fields"
import {
  BUDGET_DETAIL_SECTIONS,
  getBudget,
  getBudgetDetails,
} from "../../application/budget/read"
import {
  buildPageInfo,
  pageInfoSchema,
  paginationInputSchema,
  resolvePageRequest,
} from "../pagination"
import { toolSuccess } from "../result"
import { defineTool, READ_ONLY_ANNOTATIONS } from "./define"
import {
  BUDGET_ENTRY_TYPES,
  BUDGET_FREQUENCIES,
  BUDGET_LOAN_REPAYMENT_TYPES,
  BUDGET_LOAN_TYPES,
  TRIP_TRANSPORT_TYPES,
  calculated,
  calculatedMoneySchema,
  calendarDate,
  calendarDateOutputSchema,
  money,
  storedMoneySchema,
  timestamp,
  timestampSchema,
} from "./shared"

const totalsSchema = z
  .object({
    grossIncome: calculatedMoneySchema,
    netIncome: calculatedMoneySchema.describe(
      "Salary after tax: the member's netMonthlyIncome where set, otherwise gross minus taxPercent."
    ),
    totalIncome: calculatedMoneySchema.describe(
      "Net salary income plus INCOME entries."
    ),
    loanInterest: calculatedMoneySchema.describe(
      "Average monthly interest over the next 12 months, from today's balance."
    ),
    loanPrincipal: calculatedMoneySchema,
    loanFees: calculatedMoneySchema,
    loanCost: calculatedMoneySchema,
    tripCost: calculatedMoneySchema.describe(
      "Annual trip cost spread monthly."
    ),
    totalExpenses: calculatedMoneySchema.describe(
      "Loans, trips and EXPENSE entries. Savings are not expenses."
    ),
    savings: calculatedMoneySchema.describe("SAVINGS entries per month."),
    savingsIncludingPrincipal: calculatedMoneySchema.describe(
      "SAVINGS entries plus loan principal, which also builds wealth."
    ),
    taxDeduction: calculatedMoneySchema.describe(
      "Monthly value of the interest deduction."
    ),
    totalDeductions: calculatedMoneySchema,
    disposable: calculatedMoneySchema.describe(
      "Income minus expenses and savings, plus deductions."
    ),
    totalDebt: calculatedMoneySchema.describe("Sum of all loan balances."),
    mortgageDebt: calculatedMoneySchema.describe(
      "Sum of MORTGAGE loan balances."
    ),
  })
  .nullable()

const ratioSchema = z.string().nullable()

const keyFiguresSchema = z
  .object({
    savingsRatePercent: ratioSchema.describe(
      "savingsIncludingPrincipal as a percentage of totalIncome; null without income."
    ),
    debtToIncomeRatio: ratioSchema.describe(
      "totalDebt divided by yearly gross salary (Norwegian banks lend up to 5×); null without salary or debt."
    ),
    loanToValuePercent: ratioSchema.describe(
      "mortgageDebt as a percentage of propertyValue; null until propertyValue is set."
    ),
  })
  .nullable()

const countsSchema = z
  .object({
    members: z.number().int(),
    loans: z.number().int(),
    trips: z.number().int(),
    entries: z.number().int(),
  })
  .nullable()

/**
 * The get-budget-summary payload. Budget write tools return it twice, before
 * and after the change, so a client compares like with like.
 */
export const budgetSummaryShape = {
  hasBudget: z
    .boolean()
    .describe("False when the household has not set up a budget yet."),
  currency: z.literal("NOK"),
  totals: totalsSchema,
  keyFigures: keyFiguresSchema,
  counts: countsSchema,
}

export const budgetSummarySchema = z.object(budgetSummaryShape)

function ratio(value: number | null) {
  return value === null ? null : calculated(value)
}

export function serializeBudgetSummary(
  stats: ReturnType<typeof calculateBudgetStats>
): z.infer<typeof budgetSummarySchema> {
  // ADR 0001: a household without a budget row is not a NOT_FOUND — the
  // household exists, it just has nothing budgeted yet.
  if (!stats.hasBudget) {
    return {
      hasBudget: false,
      currency: "NOK",
      totals: null,
      keyFigures: null,
      counts: null,
    }
  }

  return {
    hasBudget: true,
    currency: "NOK",
    totals: {
      grossIncome: calculated(stats.totalGrossIncome),
      netIncome: calculated(stats.totalNetIncome),
      totalIncome: calculated(stats.totalIncome),
      loanInterest: calculated(stats.totalLoanInterest),
      loanPrincipal: calculated(stats.totalLoanPrincipal),
      loanFees: calculated(stats.totalLoanFees),
      loanCost: calculated(stats.totalLoanCost),
      tripCost: calculated(stats.totalTripCost),
      totalExpenses: calculated(stats.totalExpenses),
      savings: calculated(stats.totalSavings),
      savingsIncludingPrincipal: calculated(stats.savingsIncludingPrincipal),
      taxDeduction: calculated(stats.monthlyTaxDeduction),
      totalDeductions: calculated(stats.totalDeductions),
      disposable: calculated(stats.disposable),
      totalDebt: calculated(stats.totalDebt),
      mortgageDebt: calculated(stats.mortgageDebt),
    },
    keyFigures: {
      savingsRatePercent: ratio(stats.savingsRate),
      debtToIncomeRatio: ratio(stats.debtToIncomeRatio),
      loanToValuePercent: ratio(stats.loanToValue),
    },
    counts: {
      members: stats.memberCount,
      loans: stats.loanCount,
      trips: stats.tripCount,
      entries: stats.entryCount,
    },
  }
}

export const getBudgetSummaryTool = defineTool({
  name: "get-budget-summary",
  scope: "budget:read",
  title: "Get the budget summary",
  description:
    "Returns the household's monthly budget totals (income, loan cost, trips, savings, deductions, the disposable amount) and key figures (savings rate, debt-to-income, loan-to-value). All amounts are monthly NOK. Use get-budget-details for the rows behind these totals.",
  inputSchema: {},
  outputSchema: budgetSummaryShape,
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (_args, session) => {
    const budget = await getBudget(session.context)
    const summary = serializeBudgetSummary(calculateBudgetStats(budget))

    return toolSuccess(
      summary,
      summary.totals
        ? `Disponibelt per måned: ${summary.totals.disposable} NOK.`
        : "Husstanden har ikke satt opp et budsjett ennå."
    )
  },
})

// ─── Row shapes, shared with the budget write tools ─────────────

const missingFieldsSchema = z
  .array(z.string())
  .describe(
    "Optional fields that apply to this row but are empty. Ask the user or look them up when relevant; never invent values."
  )

const notesSchema = z.string().nullable()

export const budgetMemberRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  grossMonthlyIncome: storedMoneySchema,
  taxPercent: storedMoneySchema,
  netMonthlyIncome: storedMoneySchema.describe(
    "Actual monthly payout from the payslip, or null. When set it replaces gross minus taxPercent."
  ),
  notes: notesSchema,
  effectiveNetMonthlyIncome: calculatedMoneySchema.describe(
    "The net income the budget uses for this member."
  ),
  missingFields: missingFieldsSchema,
  sortOrder: z.number().int(),
  updatedAt: timestampSchema,
})

export const budgetLoanRowSchema = z.object({
  id: z.string(),
  bankName: z.string(),
  loanName: z.string(),
  loanType: z.enum(BUDGET_LOAN_TYPES),
  repaymentType: z.enum(BUDGET_LOAN_REPAYMENT_TYPES),
  principalAmount: storedMoneySchema.describe("Remaining balance today."),
  annualInterestRate: storedMoneySchema,
  termMonths: z.number().int().describe("Remaining term in months."),
  monthlyFees: storedMoneySchema,
  fixedRateUntil: calendarDateOutputSchema,
  notes: notesSchema,
  calculated: z.object({
    monthlyInterest: calculatedMoneySchema.describe(
      "Average over the next 12 months."
    ),
    monthlyPrincipal: calculatedMoneySchema,
    monthlyCost: calculatedMoneySchema.describe(
      "Interest, principal and fees per month."
    ),
    firstPayment: calculatedMoneySchema.describe(
      "This month's payment without fees."
    ),
    remainingInterest: calculatedMoneySchema.describe(
      "Interest left to pay over the remaining term."
    ),
  }),
  missingFields: missingFieldsSchema,
  sortOrder: z.number().int(),
  updatedAt: timestampSchema,
})

export const budgetTripRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  transportType: z.enum(TRIP_TRANSPORT_TYPES),
  annualTrips: z.number().int(),
  ticketPerTrip: storedMoneySchema,
  tollPerTrip: storedMoneySchema,
  ferryPerTrip: storedMoneySchema,
  fuelPerTrip: storedMoneySchema,
  otherPerTrip: storedMoneySchema,
  notes: notesSchema,
  monthlyCost: calculatedMoneySchema,
  missingFields: missingFieldsSchema,
  sortOrder: z.number().int(),
  updatedAt: timestampSchema,
})

export const budgetCategoryRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  updatedAt: timestampSchema,
})

export const budgetEntryRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(BUDGET_ENTRY_TYPES),
  amount: storedMoneySchema.describe("Amount per occurrence."),
  frequency: z.enum(BUDGET_FREQUENCIES),
  monthlyAmount: calculatedMoneySchema.describe(
    "amount converted to a monthly figure."
  ),
  provider: z.string().nullable(),
  paymentDay: z.number().int().nullable(),
  renewalDate: calendarDateOutputSchema,
  notes: notesSchema,
  category: z.object({ id: z.string(), name: z.string() }).nullable(),
  missingFields: missingFieldsSchema,
  sortOrder: z.number().int(),
  updatedAt: timestampSchema,
})

type DecimalLike = { toString(): string; toNumber(): number }

export function serializeBudgetMember(member: {
  id: string
  name: string
  grossMonthlyIncome: DecimalLike
  taxPercent: DecimalLike
  netMonthlyIncome: DecimalLike | null
  notes: string | null
  sortOrder: number
  updatedAt: Date
}) {
  return {
    id: member.id,
    name: member.name,
    grossMonthlyIncome: money(member.grossMonthlyIncome),
    taxPercent: money(member.taxPercent),
    netMonthlyIncome: money(member.netMonthlyIncome),
    notes: member.notes,
    effectiveNetMonthlyIncome: calculated(memberNetIncome(member)),
    missingFields: missingFieldKeys(BUDGET_MEMBER_OPTIONAL_FIELDS, member),
    sortOrder: member.sortOrder,
    updatedAt: timestamp(member.updatedAt),
  }
}

export function serializeBudgetLoan(loan: {
  id: string
  bankName: string
  loanName: string
  loanType: z.infer<typeof budgetLoanRowSchema>["loanType"]
  repaymentType: z.infer<typeof budgetLoanRowSchema>["repaymentType"]
  principalAmount: DecimalLike
  annualInterestRate: DecimalLike
  termMonths: number
  monthlyFees: DecimalLike
  fixedRateUntil: Date | null
  notes: string | null
  sortOrder: number
  updatedAt: Date
}) {
  const amounts = loanMonthlyAmounts(loan)

  return {
    id: loan.id,
    bankName: loan.bankName,
    loanName: loan.loanName,
    loanType: loan.loanType,
    repaymentType: loan.repaymentType,
    principalAmount: money(loan.principalAmount),
    annualInterestRate: money(loan.annualInterestRate),
    termMonths: loan.termMonths,
    monthlyFees: money(loan.monthlyFees),
    fixedRateUntil: calendarDate(loan.fixedRateUntil),
    notes: loan.notes,
    calculated: {
      monthlyInterest: calculated(amounts.monthlyInterest),
      monthlyPrincipal: calculated(amounts.monthlyPrincipal),
      monthlyCost: calculated(amounts.monthlyCost),
      firstPayment: calculated(amounts.firstPayment),
      remainingInterest: calculated(amounts.remainingInterest),
    },
    missingFields: missingFieldKeys(BUDGET_LOAN_OPTIONAL_FIELDS, loan),
    sortOrder: loan.sortOrder,
    updatedAt: timestamp(loan.updatedAt),
  }
}

export function serializeBudgetTrip(trip: {
  id: string
  name: string
  transportType: z.infer<typeof budgetTripRowSchema>["transportType"]
  annualTrips: number
  ticketPerTrip: DecimalLike | null
  tollPerTrip: DecimalLike | null
  ferryPerTrip: DecimalLike | null
  fuelPerTrip: DecimalLike | null
  otherPerTrip: DecimalLike | null
  notes: string | null
  sortOrder: number
  updatedAt: Date
}) {
  return {
    id: trip.id,
    name: trip.name,
    transportType: trip.transportType,
    annualTrips: trip.annualTrips,
    ticketPerTrip: money(trip.ticketPerTrip),
    tollPerTrip: money(trip.tollPerTrip),
    ferryPerTrip: money(trip.ferryPerTrip),
    fuelPerTrip: money(trip.fuelPerTrip),
    otherPerTrip: money(trip.otherPerTrip),
    notes: trip.notes,
    monthlyCost: calculated(tripMonthlyCost(trip)),
    missingFields: missingFieldKeys(BUDGET_TRIP_OPTIONAL_FIELDS, trip),
    sortOrder: trip.sortOrder,
    updatedAt: timestamp(trip.updatedAt),
  }
}

export function serializeBudgetCategory(category: {
  id: string
  name: string
  sortOrder: number
  updatedAt: Date
}) {
  return {
    id: category.id,
    name: category.name,
    sortOrder: category.sortOrder,
    updatedAt: timestamp(category.updatedAt),
  }
}

export function serializeBudgetEntry(entry: {
  id: string
  name: string
  type: z.infer<typeof budgetEntryRowSchema>["type"]
  amount: DecimalLike
  frequency: z.infer<typeof budgetEntryRowSchema>["frequency"]
  provider: string | null
  paymentDay: number | null
  renewalDate: Date | null
  notes: string | null
  sortOrder: number
  category: { id: string; name: string } | null
  updatedAt: Date
}) {
  return {
    id: entry.id,
    name: entry.name,
    type: entry.type,
    amount: money(entry.amount),
    frequency: entry.frequency,
    monthlyAmount: calculated(entryMonthlyAmount(entry)),
    provider: entry.provider,
    paymentDay: entry.paymentDay,
    renewalDate: calendarDate(entry.renewalDate),
    notes: entry.notes,
    category: entry.category
      ? { id: entry.category.id, name: entry.category.name }
      : null,
    missingFields: missingFieldKeys(BUDGET_ENTRY_OPTIONAL_FIELDS, entry),
    sortOrder: entry.sortOrder,
    updatedAt: timestamp(entry.updatedAt),
  }
}

export const getBudgetDetailsTool = defineTool({
  name: "get-budget-details",
  scope: "budget:read",
  title: "Get budget details",
  description:
    "Returns the rows behind the budget summary, each with its calculated monthly figures and missingFields: the optional fields that are still empty. Request only the sections you need; entries is the only paged section. Member names are part of this contract because they identify the income rows.",
  inputSchema: {
    sections: z
      .array(z.enum(BUDGET_DETAIL_SECTIONS))
      .min(1)
      .max(BUDGET_DETAIL_SECTIONS.length)
      .optional()
      .describe(
        `Sections to include. Defaults to all of: ${BUDGET_DETAIL_SECTIONS.join(", ")}.`
      ),
    ...paginationInputSchema,
  },
  outputSchema: {
    hasBudget: z.boolean(),
    currency: z.literal("NOK"),
    taxDeductionPercent: storedMoneySchema.describe(
      "Percentage of loan interest that is tax deductible."
    ),
    propertyValue: storedMoneySchema.describe(
      "Market value of the home, used for loan-to-value."
    ),
    missingFields: missingFieldsSchema.nullable(),
    members: z.array(budgetMemberRowSchema).nullable(),
    loans: z.array(budgetLoanRowSchema).nullable(),
    trips: z.array(budgetTripRowSchema).nullable(),
    categories: z.array(budgetCategoryRowSchema).nullable(),
    entries: z.array(budgetEntryRowSchema).nullable(),
    entriesPageInfo: pageInfoSchema.nullable(),
    updatedAt: timestampSchema.nullable(),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    const page = resolvePageRequest(args)
    const sections = args.sections ?? [...BUDGET_DETAIL_SECTIONS]
    const details = await getBudgetDetails(session.context, {
      ...page,
      sections,
    })

    if (!details) {
      return toolSuccess(
        {
          hasBudget: false,
          currency: "NOK",
          taxDeductionPercent: null,
          propertyValue: null,
          missingFields: null,
          members: null,
          loans: null,
          trips: null,
          categories: null,
          entries: null,
          entriesPageInfo: null,
          updatedAt: null,
        },
        "Husstanden har ikke satt opp et budsjett ennå."
      )
    }

    const entries = details.entries?.map(serializeBudgetEntry) ?? null

    return toolSuccess(
      {
        hasBudget: true,
        currency: "NOK",
        taxDeductionPercent: money(details.budget.taxDeductionPercent),
        propertyValue: money(details.budget.propertyValue),
        missingFields: missingFieldKeys(BUDGET_SETTINGS_OPTIONAL_FIELDS, {
          propertyValue: details.budget.propertyValue,
          hasMortgage: details.hasMortgage,
        }),
        members: details.members?.map(serializeBudgetMember) ?? null,
        loans: details.loans?.map(serializeBudgetLoan) ?? null,
        trips: details.trips?.map(serializeBudgetTrip) ?? null,
        categories: details.categories?.map(serializeBudgetCategory) ?? null,
        entries,
        entriesPageInfo: entries
          ? buildPageInfo(page, entries.length, details.entryCount)
          : null,
        updatedAt: timestamp(details.budget.updatedAt),
      },
      `Budsjettdetaljer for seksjonene: ${sections.join(", ")}.`
    )
  },
})

export const budgetTools = [getBudgetSummaryTool, getBudgetDetailsTool]
