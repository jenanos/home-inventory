import { z } from "zod"

import { calculateBudgetStats } from "../../application/budget/calculations"
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
  BUDGET_LOAN_REPAYMENT_TYPES,
  BUDGET_LOAN_TYPES,
  TRIP_TRANSPORT_TYPES,
  calculated,
  calculatedMoneySchema,
  money,
  storedMoneySchema,
  timestamp,
  timestampSchema,
} from "./shared"

const totalsSchema = z
  .object({
    grossIncome: calculatedMoneySchema,
    netIncome: calculatedMoneySchema,
    totalIncome: calculatedMoneySchema.describe(
      "Net salary income plus INCOME entries."
    ),
    loanInterest: calculatedMoneySchema,
    loanPrincipal: calculatedMoneySchema,
    loanFees: calculatedMoneySchema,
    loanCost: calculatedMoneySchema,
    tripCost: calculatedMoneySchema.describe(
      "Annual trip cost spread monthly."
    ),
    totalExpenses: calculatedMoneySchema,
    taxDeduction: calculatedMoneySchema.describe(
      "Monthly value of the interest deduction."
    ),
    totalDeductions: calculatedMoneySchema,
    disposable: calculatedMoneySchema.describe(
      "Income minus expenses plus deductions."
    ),
  })
  .nullable()

export const getBudgetSummaryTool = defineTool({
  name: "get-budget-summary",
  scope: "budget:read",
  title: "Get the budget summary",
  description:
    "Returns the household's monthly budget totals: income, loan cost, trips, deductions and the disposable amount. All amounts are monthly NOK. Use get-budget-details for the individual rows behind these totals.",
  inputSchema: {},
  outputSchema: {
    hasBudget: z
      .boolean()
      .describe("False when the household has not set up a budget yet."),
    currency: z.literal("NOK"),
    totals: totalsSchema,
    counts: z
      .object({
        members: z.number().int(),
        loans: z.number().int(),
        trips: z.number().int(),
        entries: z.number().int(),
      })
      .nullable(),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (_args, session) => {
    const budget = await getBudget(session.context)
    const stats = calculateBudgetStats(budget)

    // ADR 0001: a household without a budget row is not a NOT_FOUND — the
    // household exists, it just has nothing budgeted yet.
    if (!stats.hasBudget) {
      return toolSuccess(
        { hasBudget: false, currency: "NOK", totals: null, counts: null },
        "Husstanden har ikke satt opp et budsjett ennå."
      )
    }

    return toolSuccess(
      {
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
          taxDeduction: calculated(stats.monthlyTaxDeduction),
          totalDeductions: calculated(stats.totalDeductions),
          disposable: calculated(stats.disposable),
        },
        counts: {
          members: stats.memberCount,
          loans: stats.loanCount,
          trips: stats.tripCount,
          entries: stats.entryCount,
        },
      },
      `Disponibelt per måned: ${calculated(stats.disposable)} NOK.`
    )
  },
})

export const getBudgetDetailsTool = defineTool({
  name: "get-budget-details",
  scope: "budget:read",
  title: "Get budget details",
  description:
    "Returns the rows behind the budget summary. Request only the sections you need; entries is the only paged section. Member names are part of this contract because they identify the income rows.",
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
    members: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          grossMonthlyIncome: storedMoneySchema,
          taxPercent: storedMoneySchema,
          sortOrder: z.number().int(),
        })
      )
      .nullable(),
    loans: z
      .array(
        z.object({
          id: z.string(),
          bankName: z.string(),
          loanName: z.string(),
          loanType: z.enum(BUDGET_LOAN_TYPES),
          repaymentType: z.enum(BUDGET_LOAN_REPAYMENT_TYPES),
          principalAmount: storedMoneySchema,
          annualInterestRate: storedMoneySchema,
          termMonths: z.number().int(),
          monthlyFees: storedMoneySchema,
          sortOrder: z.number().int(),
        })
      )
      .nullable(),
    trips: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          transportType: z.enum(TRIP_TRANSPORT_TYPES),
          annualTrips: z.number().int(),
          ticketPerTrip: storedMoneySchema,
          tollPerTrip: storedMoneySchema,
          ferryPerTrip: storedMoneySchema,
          fuelPerTrip: storedMoneySchema,
          sortOrder: z.number().int(),
        })
      )
      .nullable(),
    categories: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          sortOrder: z.number().int(),
        })
      )
      .nullable(),
    entries: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          type: z.enum(BUDGET_ENTRY_TYPES),
          monthlyAmount: storedMoneySchema,
          sortOrder: z.number().int(),
          category: z.object({ id: z.string(), name: z.string() }).nullable(),
        })
      )
      .nullable(),
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

    const entries =
      details.entries?.map((entry) => ({
        id: entry.id,
        name: entry.name,
        type: entry.type,
        monthlyAmount: money(entry.monthlyAmount),
        sortOrder: entry.sortOrder,
        category: entry.category,
      })) ?? null

    return toolSuccess(
      {
        hasBudget: true,
        currency: "NOK",
        taxDeductionPercent: money(details.budget.taxDeductionPercent),
        members:
          details.members?.map((member) => ({
            id: member.id,
            name: member.name,
            grossMonthlyIncome: money(member.grossMonthlyIncome),
            taxPercent: money(member.taxPercent),
            sortOrder: member.sortOrder,
          })) ?? null,
        loans:
          details.loans?.map((loan) => ({
            id: loan.id,
            bankName: loan.bankName,
            loanName: loan.loanName,
            loanType: loan.loanType,
            repaymentType: loan.repaymentType,
            principalAmount: money(loan.principalAmount),
            annualInterestRate: money(loan.annualInterestRate),
            termMonths: loan.termMonths,
            monthlyFees: money(loan.monthlyFees),
            sortOrder: loan.sortOrder,
          })) ?? null,
        trips:
          details.trips?.map((trip) => ({
            id: trip.id,
            name: trip.name,
            transportType: trip.transportType,
            annualTrips: trip.annualTrips,
            ticketPerTrip: money(trip.ticketPerTrip),
            tollPerTrip: money(trip.tollPerTrip),
            ferryPerTrip: money(trip.ferryPerTrip),
            fuelPerTrip: money(trip.fuelPerTrip),
            sortOrder: trip.sortOrder,
          })) ?? null,
        categories:
          details.categories?.map((category) => ({
            id: category.id,
            name: category.name,
            sortOrder: category.sortOrder,
          })) ?? null,
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
