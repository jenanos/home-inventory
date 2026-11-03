import { z } from "zod"

import {
  createBudgetCategory,
  createBudgetEntry,
  createBudgetLoan,
  createBudgetMember,
  createBudgetTrip,
  setTaxDeductionPercent,
  updateBudgetCategory,
  updateBudgetEntry,
  updateBudgetLoan,
  updateBudgetMember,
  updateBudgetTrip,
  type BudgetWriteResult,
} from "../../application/budget/write"
import {
  budgetCategoryRowSchema,
  budgetEntryRowSchema,
  budgetLoanRowSchema,
  budgetMemberRowSchema,
  budgetSummarySchema,
  budgetTripRowSchema,
  serializeBudgetCategory,
  serializeBudgetEntry,
  serializeBudgetLoan,
  serializeBudgetMember,
  serializeBudgetSummary,
  serializeBudgetTrip,
} from "./budget"
import {
  CREATE_ANNOTATIONS,
  defineWriteTool,
  UPDATE_ANNOTATIONS,
  type McpToolDefinition,
  type WriteToolResult,
} from "./define"
import {
  BUDGET_ENTRY_TYPES,
  BUDGET_LOAN_REPAYMENT_TYPES,
  BUDGET_LOAN_TYPES,
  TRIP_TRANSPORT_TYPES,
  expectedUpdatedAtSchema,
  idSchema,
  money,
  moneyInputSchema,
  nameInputSchema,
  parseExpectedUpdatedAt,
  storedMoneySchema,
} from "./shared"

/*
 * Budget write tools. Every tool takes `dryRun`: the change runs in a
 * transaction, the summary is recomputed with the same calculation the web
 * page uses, and the transaction is rolled back. A client can therefore show
 * the user the exact effect before anything is stored, without a separate
 * preview/apply protocol.
 */

const dryRunSchema = z
  .boolean()
  .optional()
  .describe(
    "Preview only: compute the result and the summary after the change, then discard it. Use this first for any change the user has not explicitly confirmed."
  )

const percentInputSchema = z.number().min(0).max(100)

/** `Decimal(14, 2)` on `BudgetLoan.principalAmount`. */
const principalInputSchema = z
  .number()
  .nonnegative()
  .max(999_999_999_999.99)
  .describe("Loan principal in NOK.")

const optionalCostSchema = moneyInputSchema.nullable().optional()

function writeOutput(key: string, row: z.AnyZodObject): z.ZodRawShape {
  return {
    [key]: row,
    dryRun: z
      .boolean()
      .describe("True when nothing was saved and this is only a preview."),
    summaryBefore: budgetSummarySchema,
    summaryAfter: budgetSummarySchema.describe(
      "The get-budget-summary payload as it is (or would be) after the change."
    ),
  }
}

function toWriteResult<TResource extends { id: string; updatedAt: Date }>(
  key: string,
  result: BudgetWriteResult<TResource>,
  serialized: Record<string, unknown>,
  label: string,
  kind: "create" | "update"
): WriteToolResult {
  const before = serializeBudgetSummary(result.summaryBefore)
  const after = serializeBudgetSummary(result.summaryAfter)
  const disposable = after.totals
    ? ` Disponibelt per måned: ${before.totals?.disposable ?? "0.00"} → ${after.totals.disposable} NOK.`
    : ""
  const action = kind === "create" ? "Opprettet" : "Oppdaterte"

  return {
    structuredContent: {
      [key]: serialized,
      dryRun: result.dryRun,
      summaryBefore: before,
      summaryAfter: after,
    },
    summary: result.dryRun
      ? `Forhåndsvisning, ikke lagret: ${label}.${disposable}`
      : `${action} ${label}.${disposable}`,
    // A dry-run create has no row afterwards, so there is nothing to point at.
    resourceId: result.dryRun && kind === "create" ? null : result.resource.id,
    dryRun: result.dryRun,
  }
}

const options = (args: { dryRun?: boolean }) => ({ dryRun: args.dryRun })

// ─── Entries ────────────────────────────────────────────────────

const entryOutput = writeOutput("entry", budgetEntryRowSchema)

export const createBudgetEntryTool = defineWriteTool({
  name: "create-budget-entry",
  scope: "budget:write",
  title: "Create a budget entry",
  description:
    "Adds a monthly income, expense or deduction row to the household budget. Check get-budget-details first so the same entry is not added twice. Returns the entry and the budget summary before and after.",
  inputSchema: {
    name: nameInputSchema,
    type: z.enum(BUDGET_ENTRY_TYPES),
    monthlyAmount: moneyInputSchema.describe(
      "Monthly amount in NOK, always positive; the type decides the sign."
    ),
    categoryId: idSchema
      .nullable()
      .optional()
      .describe("Category id from get-budget-details, or null for none."),
    dryRun: dryRunSchema,
  },
  outputSchema: entryOutput,
  annotations: CREATE_ANNOTATIONS,
  resourceType: "budget_entry",
  handler: async (args, session) => {
    const { dryRun, ...fields } = args
    const result = await createBudgetEntry(session.context, fields, { dryRun })
    return toWriteResult(
      "entry",
      result,
      serializeBudgetEntry(result.resource),
      `budsjettposten ${result.resource.name}`,
      "create"
    )
  },
})

export const updateBudgetEntryTool = defineWriteTool({
  name: "update-budget-entry",
  scope: "budget:write",
  title: "Update a budget entry",
  description:
    "Changes the given fields of one budget entry and leaves omitted fields unchanged; categoryId null removes the category. Returns the entry and the budget summary before and after.",
  inputSchema: {
    entryId: idSchema.describe("Entry id from get-budget-details."),
    name: nameInputSchema.optional(),
    type: z.enum(BUDGET_ENTRY_TYPES).optional(),
    monthlyAmount: moneyInputSchema.optional(),
    categoryId: idSchema.nullable().optional(),
    expectedUpdatedAt: expectedUpdatedAtSchema,
    dryRun: dryRunSchema,
  },
  outputSchema: entryOutput,
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "budget_entry",
  handler: async (args, session) => {
    const { entryId, expectedUpdatedAt, dryRun, ...fields } = args
    const result = await updateBudgetEntry(
      session.context,
      entryId,
      {
        ...fields,
        expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
      },
      { dryRun }
    )
    return toWriteResult(
      "entry",
      result,
      serializeBudgetEntry(result.resource),
      `budsjettposten ${result.resource.name}`,
      "update"
    )
  },
})

// ─── Categories ─────────────────────────────────────────────────

const categoryOutput = writeOutput("category", budgetCategoryRowSchema)

export const createBudgetCategoryTool = defineWriteTool({
  name: "create-budget-category",
  scope: "budget:write",
  title: "Create a budget category",
  description:
    "Adds a category for grouping budget entries. A name that already exists, ignoring case, is rejected with CONFLICT.",
  inputSchema: { name: nameInputSchema, dryRun: dryRunSchema },
  outputSchema: categoryOutput,
  annotations: CREATE_ANNOTATIONS,
  resourceType: "budget_category",
  handler: async (args, session) => {
    const result = await createBudgetCategory(
      session.context,
      { name: args.name },
      options(args)
    )
    return toWriteResult(
      "category",
      result,
      serializeBudgetCategory(result.resource),
      `kategorien ${result.resource.name}`,
      "create"
    )
  },
})

export const updateBudgetCategoryTool = defineWriteTool({
  name: "update-budget-category",
  scope: "budget:write",
  title: "Rename a budget category",
  description:
    "Renames one budget category. A name another category already has, ignoring case, is rejected with CONFLICT.",
  inputSchema: {
    categoryId: idSchema.describe("Category id from get-budget-details."),
    name: nameInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
    dryRun: dryRunSchema,
  },
  outputSchema: categoryOutput,
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "budget_category",
  handler: async (args, session) => {
    const result = await updateBudgetCategory(
      session.context,
      args.categoryId,
      {
        name: args.name,
        expectedUpdatedAt: parseExpectedUpdatedAt(args.expectedUpdatedAt),
      },
      options(args)
    )
    return toWriteResult(
      "category",
      result,
      serializeBudgetCategory(result.resource),
      `kategorien ${result.resource.name}`,
      "update"
    )
  },
})

// ─── Members ────────────────────────────────────────────────────

const memberOutput = writeOutput("member", budgetMemberRowSchema)

export const createBudgetMemberTool = defineWriteTool({
  name: "create-budget-member",
  scope: "budget:write",
  title: "Add an income earner",
  description:
    "Adds a person's salary to the budget: gross monthly income and the tax percentage used to compute net income. Returns the member and the budget summary before and after.",
  inputSchema: {
    name: nameInputSchema.describe(
      "Label for the income row, e.g. a first name."
    ),
    grossMonthlyIncome: moneyInputSchema,
    taxPercent: percentInputSchema.describe("Effective tax rate, 0–100."),
    dryRun: dryRunSchema,
  },
  outputSchema: memberOutput,
  annotations: CREATE_ANNOTATIONS,
  resourceType: "budget_member",
  handler: async (args, session) => {
    const { dryRun, ...fields } = args
    const result = await createBudgetMember(session.context, fields, { dryRun })
    return toWriteResult(
      "member",
      result,
      serializeBudgetMember(result.resource),
      `inntekten for ${result.resource.name}`,
      "create"
    )
  },
})

export const updateBudgetMemberTool = defineWriteTool({
  name: "update-budget-member",
  scope: "budget:write",
  title: "Update an income earner",
  description:
    "Changes the given fields of one income row and leaves omitted fields unchanged. Returns the member and the budget summary before and after.",
  inputSchema: {
    memberId: idSchema.describe("Member id from get-budget-details."),
    name: nameInputSchema.optional(),
    grossMonthlyIncome: moneyInputSchema.optional(),
    taxPercent: percentInputSchema.optional(),
    expectedUpdatedAt: expectedUpdatedAtSchema,
    dryRun: dryRunSchema,
  },
  outputSchema: memberOutput,
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "budget_member",
  handler: async (args, session) => {
    const { memberId, expectedUpdatedAt, dryRun, ...fields } = args
    const result = await updateBudgetMember(
      session.context,
      memberId,
      {
        ...fields,
        expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
      },
      { dryRun }
    )
    return toWriteResult(
      "member",
      result,
      serializeBudgetMember(result.resource),
      `inntekten for ${result.resource.name}`,
      "update"
    )
  },
})

// ─── Loans ──────────────────────────────────────────────────────

const loanOutput = writeOutput("loan", budgetLoanRowSchema)

const loanFieldsInputSchema = {
  loanType: z.enum(BUDGET_LOAN_TYPES).optional(),
  repaymentType: z
    .enum(BUDGET_LOAN_REPAYMENT_TYPES)
    .optional()
    .describe("ANNUITY (equal payments) or SERIAL (equal principal)."),
  annualInterestRate: percentInputSchema.describe(
    "Nominal yearly interest in percent, e.g. 5.25."
  ),
  termMonths: z.number().int().min(1).max(600),
  monthlyFees: moneyInputSchema.optional(),
}

export const createBudgetLoanTool = defineWriteTool({
  name: "create-budget-loan",
  scope: "budget:write",
  title: "Add a loan",
  description:
    "Adds a loan; monthly interest, principal and the interest deduction are computed from it. Defaults: MORTGAGE, ANNUITY, no fees. Returns the loan and the budget summary before and after.",
  inputSchema: {
    bankName: nameInputSchema,
    loanName: nameInputSchema,
    principalAmount: principalInputSchema,
    ...loanFieldsInputSchema,
    dryRun: dryRunSchema,
  },
  outputSchema: loanOutput,
  annotations: CREATE_ANNOTATIONS,
  resourceType: "budget_loan",
  handler: async (args, session) => {
    const { dryRun, ...fields } = args
    const result = await createBudgetLoan(session.context, fields, { dryRun })
    return toWriteResult(
      "loan",
      result,
      serializeBudgetLoan(result.resource),
      `lånet ${result.resource.loanName}`,
      "create"
    )
  },
})

export const updateBudgetLoanTool = defineWriteTool({
  name: "update-budget-loan",
  scope: "budget:write",
  title: "Update a loan",
  description:
    "Changes the given fields of one loan, e.g. a new interest rate, and leaves omitted fields unchanged. Returns the loan and the budget summary before and after.",
  inputSchema: {
    loanId: idSchema.describe("Loan id from get-budget-details."),
    bankName: nameInputSchema.optional(),
    loanName: nameInputSchema.optional(),
    principalAmount: principalInputSchema.optional(),
    loanType: loanFieldsInputSchema.loanType,
    repaymentType: loanFieldsInputSchema.repaymentType,
    annualInterestRate: loanFieldsInputSchema.annualInterestRate.optional(),
    termMonths: loanFieldsInputSchema.termMonths.optional(),
    monthlyFees: loanFieldsInputSchema.monthlyFees,
    expectedUpdatedAt: expectedUpdatedAtSchema,
    dryRun: dryRunSchema,
  },
  outputSchema: loanOutput,
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "budget_loan",
  handler: async (args, session) => {
    const { loanId, expectedUpdatedAt, dryRun, ...fields } = args
    const result = await updateBudgetLoan(
      session.context,
      loanId,
      {
        ...fields,
        expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
      },
      { dryRun }
    )
    return toWriteResult(
      "loan",
      result,
      serializeBudgetLoan(result.resource),
      `lånet ${result.resource.loanName}`,
      "update"
    )
  },
})

// ─── Trips ──────────────────────────────────────────────────────

const tripOutput = writeOutput("trip", budgetTripRowSchema)

const tripCostInputSchema = {
  ticketPerTrip: optionalCostSchema.describe(
    "Ticket cost per trip. Only used for AIR_OR_PUBLIC."
  ),
  tollPerTrip: optionalCostSchema.describe("Only used for CAR."),
  ferryPerTrip: optionalCostSchema.describe("Only used for CAR."),
  fuelPerTrip: optionalCostSchema.describe("Only used for CAR."),
}

export const createBudgetTripTool = defineWriteTool({
  name: "create-budget-trip",
  scope: "budget:write",
  title: "Add a recurring trip",
  description:
    "Adds a recurring trip whose yearly cost is spread over the months. Cost fields that do not apply to the transport type are stored as null. Returns the trip and the budget summary before and after.",
  inputSchema: {
    name: nameInputSchema,
    transportType: z.enum(TRIP_TRANSPORT_TYPES),
    annualTrips: z.number().int().min(1).max(1000).optional(),
    ...tripCostInputSchema,
    dryRun: dryRunSchema,
  },
  outputSchema: tripOutput,
  annotations: CREATE_ANNOTATIONS,
  resourceType: "budget_trip",
  handler: async (args, session) => {
    const { dryRun, ...fields } = args
    const result = await createBudgetTrip(session.context, fields, { dryRun })
    return toWriteResult(
      "trip",
      result,
      serializeBudgetTrip(result.resource),
      `reisen ${result.resource.name}`,
      "create"
    )
  },
})

export const updateBudgetTripTool = defineWriteTool({
  name: "update-budget-trip",
  scope: "budget:write",
  title: "Update a recurring trip",
  description:
    "Changes the given fields of one trip and leaves omitted fields unchanged. Changing transportType clears the costs that no longer apply. Returns the trip and the budget summary before and after.",
  inputSchema: {
    tripId: idSchema.describe("Trip id from get-budget-details."),
    name: nameInputSchema.optional(),
    transportType: z.enum(TRIP_TRANSPORT_TYPES).optional(),
    annualTrips: z.number().int().min(1).max(1000).optional(),
    ...tripCostInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
    dryRun: dryRunSchema,
  },
  outputSchema: tripOutput,
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "budget_trip",
  handler: async (args, session) => {
    const { tripId, expectedUpdatedAt, dryRun, ...fields } = args
    const result = await updateBudgetTrip(
      session.context,
      tripId,
      {
        ...fields,
        expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
      },
      { dryRun }
    )
    return toWriteResult(
      "trip",
      result,
      serializeBudgetTrip(result.resource),
      `reisen ${result.resource.name}`,
      "update"
    )
  },
})

// ─── Tax deduction ──────────────────────────────────────────────

const budgetSettingsSchema = z.object({
  id: z.string(),
  taxDeductionPercent: storedMoneySchema.describe(
    "Percentage of loan interest that is tax deductible."
  ),
})

export const setTaxDeductionPercentTool = defineWriteTool({
  name: "set-tax-deduction-percent",
  scope: "budget:write",
  title: "Set the interest deduction rate",
  description:
    "Sets the percentage of loan interest that is tax deductible (22 in Norway as of 2026). Returns the budget summary before and after.",
  inputSchema: {
    percent: percentInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
    dryRun: dryRunSchema,
  },
  outputSchema: writeOutput("budget", budgetSettingsSchema),
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "budget",
  handler: async (args, session) => {
    const result = await setTaxDeductionPercent(
      session.context,
      {
        percent: args.percent,
        expectedUpdatedAt: parseExpectedUpdatedAt(args.expectedUpdatedAt),
      },
      options(args)
    )
    const percentText = money(result.resource.taxDeductionPercent)
    return toWriteResult(
      "budget",
      result,
      { id: result.resource.id, taxDeductionPercent: percentText },
      `rentefradraget til ${percentText} %`,
      "update"
    )
  },
})

export const budgetWriteTools: McpToolDefinition[] = [
  createBudgetEntryTool,
  updateBudgetEntryTool,
  createBudgetCategoryTool,
  updateBudgetCategoryTool,
  createBudgetMemberTool,
  updateBudgetMemberTool,
  createBudgetLoanTool,
  updateBudgetLoanTool,
  createBudgetTripTool,
  updateBudgetTripTool,
  setTaxDeductionPercentTool,
]
