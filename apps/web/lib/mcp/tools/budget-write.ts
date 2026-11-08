import { z } from "zod"

import {
  addBudgetEntries,
  createBudgetCategory,
  createBudgetEntry,
  createBudgetLoan,
  createBudgetMember,
  createBudgetTrip,
  deleteBudgetCategory,
  deleteBudgetEntry,
  deleteBudgetLoan,
  deleteBudgetMember,
  deleteBudgetTrip,
  updateBudgetCategory,
  updateBudgetEntry,
  updateBudgetLoan,
  updateBudgetMember,
  updateBudgetSettings,
  updateBudgetTrip,
  type BudgetWriteResult,
} from "../../application/budget/write"
import { MAX_BATCH_SIZE } from "../../application/mutations"
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
  DELETE_ANNOTATIONS,
  defineWriteTool,
  UPDATE_ANNOTATIONS,
  type McpToolDefinition,
  type WriteToolResult,
} from "./define"
import {
  BUDGET_ENTRY_TYPES,
  BUDGET_FREQUENCIES,
  BUDGET_LOAN_REPAYMENT_TYPES,
  BUDGET_LOAN_TYPES,
  TRIP_TRANSPORT_TYPES,
  calendarDateInputSchema,
  expectedUpdatedAtSchema,
  idSchema,
  longTextInputSchema,
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
 * preview/apply protocol. Deletes work the same way.
 */

const dryRunSchema = z
  .boolean()
  .optional()
  .describe(
    "Preview only: compute the result and the summary after the change, then discard it. Use this first for any change the user has not explicitly confirmed."
  )

const percentInputSchema = z.number().min(0).max(100)

/** `Decimal(14, 2)` on `BudgetLoan.principalAmount` and `Budget.propertyValue`. */
const largeAmountInputSchema = z.number().nonnegative().max(999_999_999_999.99)

const optionalCostSchema = moneyInputSchema.nullable().optional()

const notesInputSchema = longTextInputSchema.describe(
  "Free text, e.g. contract terms or where the number comes from. null or empty clears it."
)

const optionalDateInputSchema = calendarDateInputSchema.nullable().optional()

type Kind = "create" | "update" | "delete"

const ACTION_LABEL: Record<Kind, string> = {
  create: "Opprettet",
  update: "Oppdaterte",
  delete: "Slettet",
}

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

function disposableChange(result: BudgetWriteResult<unknown>) {
  const before = serializeBudgetSummary(result.summaryBefore)
  const after = serializeBudgetSummary(result.summaryAfter)
  const text = after.totals
    ? ` Disponibelt per måned: ${before.totals?.disposable ?? "0.00"} → ${after.totals.disposable} NOK.`
    : ""
  return { before, after, text }
}

function toWriteResult<TResource extends { id: string }>(
  key: string,
  result: BudgetWriteResult<TResource>,
  serialized: Record<string, unknown>,
  label: string,
  kind: Kind
): WriteToolResult {
  const { before, after, text } = disposableChange(result)

  return {
    structuredContent: {
      [key]: serialized,
      dryRun: result.dryRun,
      summaryBefore: before,
      summaryAfter: after,
    },
    summary: result.dryRun
      ? `Forhåndsvisning, ikke lagret: ${label}.${text}`
      : `${ACTION_LABEL[kind]} ${label}.${text}`,
    // A dry-run create has no row afterwards, so there is nothing to point at.
    resourceId: result.dryRun && kind === "create" ? null : result.resource.id,
    dryRun: result.dryRun,
  }
}

const options = (args: { dryRun?: boolean }) => ({ dryRun: args.dryRun })

// ─── Entries ────────────────────────────────────────────────────

const entryOutput = writeOutput("entry", budgetEntryRowSchema)

const entryFieldsInputSchema = {
  type: z
    .enum(BUDGET_ENTRY_TYPES)
    .describe(
      "INCOME (adds to income), EXPENSE (a cost), DEDUCTION (reduces costs, e.g. a tax deduction) or SAVINGS (money set aside: funds, BSU, buffer). Savings lower the disposable amount but are reported separately from expenses."
    ),
  amount: moneyInputSchema.describe(
    "Amount per occurrence in NOK, always positive; the type decides the sign. A yearly bill of 12 000 is amount 12000 with frequency YEARLY."
  ),
  frequency: z
    .enum(BUDGET_FREQUENCIES)
    .optional()
    .describe(
      "How often amount occurs. Defaults to MONTHLY. Use the bill's own frequency rather than converting it yourself."
    ),
  provider: nameInputSchema
    .nullable()
    .optional()
    .describe("Who is paid, e.g. 'Tibber' or 'Gjensidige'. null clears it."),
  paymentDay: z
    .number()
    .int()
    .min(1)
    .max(31)
    .nullable()
    .optional()
    .describe("Day of the month the money goes out or comes in."),
  renewalDate: optionalDateInputSchema.describe(
    "YYYY-MM-DD when a contract's binding period ends or it renews."
  ),
  notes: notesInputSchema,
}

const entryCategoryIdSchema = idSchema
  .nullable()
  .optional()
  .describe("Category id from get-budget-details, or null for none.")

export const createBudgetEntryTool = defineWriteTool({
  name: "create-budget-entry",
  scope: "budget:write",
  title: "Create a budget entry",
  description:
    "Adds one income, expense, deduction or savings row to the household budget. Check get-budget-details first so the same entry is not added twice; to add several at once use add-budget-entries. Returns the entry and the budget summary before and after.",
  inputSchema: {
    name: nameInputSchema,
    ...entryFieldsInputSchema,
    categoryId: entryCategoryIdSchema,
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

export const addBudgetEntriesTool = defineWriteTool({
  name: "add-budget-entries",
  scope: "budget:write",
  title: "Add several budget entries",
  description: `Adds up to ${MAX_BATCH_SIZE} budget entries in one all-or-nothing call, for laying out or extending a budget. Give each entry a categoryId, or a categoryName that is matched ignoring case and created if missing. An entry whose name already exists in the same category is skipped and listed in skipped instead of added twice. Returns what was created, what was skipped and the budget summary before and after.`,
  inputSchema: {
    entries: z
      .array(
        z.object({
          name: nameInputSchema,
          ...entryFieldsInputSchema,
          categoryId: entryCategoryIdSchema,
          categoryName: nameInputSchema
            .nullable()
            .optional()
            .describe(
              "Category by name, e.g. 'Bil'. Created if the budget has none by that name. Do not combine with categoryId."
            ),
        })
      )
      .min(1)
      .max(MAX_BATCH_SIZE),
    dryRun: dryRunSchema,
  },
  outputSchema: {
    created: z.array(budgetEntryRowSchema),
    skipped: z.array(
      z.object({
        index: z.number().int().describe("Position in the request, from 0."),
        name: z.string(),
        existingEntryId: z.string().nullable(),
        reason: z.enum(["ALREADY_EXISTS", "DUPLICATE_IN_REQUEST"]),
      })
    ),
    createdCategories: z.array(budgetCategoryRowSchema),
    dryRun: z.boolean(),
    summaryBefore: budgetSummarySchema,
    summaryAfter: budgetSummarySchema,
  },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "budget_entry",
  handler: async (args, session) => {
    const result = await addBudgetEntries(
      session.context,
      args.entries,
      options(args)
    )
    const { created, skipped, createdCategories } = result.resource
    const { before, after, text } = disposableChange(result)
    const counts = `${created.length} poster lagt til, ${skipped.length} hoppet over`

    return {
      structuredContent: {
        created: created.map(serializeBudgetEntry),
        skipped,
        createdCategories: createdCategories.map(serializeBudgetCategory),
        dryRun: result.dryRun,
        summaryBefore: before,
        summaryAfter: after,
      },
      summary: result.dryRun
        ? `Forhåndsvisning, ikke lagret: ${counts}.${text}`
        : `${counts}.${text}`,
      resourceId: null,
      dryRun: result.dryRun,
    }
  },
})

export const updateBudgetEntryTool = defineWriteTool({
  name: "update-budget-entry",
  scope: "budget:write",
  title: "Update a budget entry",
  description:
    "Changes the given fields of one budget entry and leaves omitted fields unchanged; null clears an optional field, and categoryId null removes the category. Returns the entry and the budget summary before and after.",
  inputSchema: {
    entryId: idSchema.describe("Entry id from get-budget-details."),
    name: nameInputSchema.optional(),
    type: entryFieldsInputSchema.type.optional(),
    amount: entryFieldsInputSchema.amount.optional(),
    frequency: entryFieldsInputSchema.frequency,
    provider: entryFieldsInputSchema.provider,
    paymentDay: entryFieldsInputSchema.paymentDay,
    renewalDate: entryFieldsInputSchema.renewalDate,
    notes: entryFieldsInputSchema.notes,
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

export const deleteBudgetEntryTool = defineWriteTool({
  name: "delete-budget-entry",
  scope: "budget:write",
  title: "Delete a budget entry",
  description:
    "Permanently deletes one budget entry. Use it for mistakes, duplicates and costs that have ended; confirm with the user first, or call with dryRun to show the effect. Returns the deleted entry and the budget summary before and after.",
  inputSchema: {
    entryId: idSchema.describe("Entry id from get-budget-details."),
    dryRun: dryRunSchema,
  },
  outputSchema: entryOutput,
  annotations: DELETE_ANNOTATIONS,
  resourceType: "budget_entry",
  handler: async (args, session) => {
    const result = await deleteBudgetEntry(
      session.context,
      args.entryId,
      options(args)
    )
    return toWriteResult(
      "entry",
      result,
      serializeBudgetEntry(result.resource),
      `budsjettposten ${result.resource.name}`,
      "delete"
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

export const deleteBudgetCategoryTool = defineWriteTool({
  name: "delete-budget-category",
  scope: "budget:write",
  title: "Delete a budget category",
  description:
    "Permanently deletes one budget category. Its entries are kept and become uncategorized, so the totals do not change; to remove the entries too, delete them first. Confirm with the user first.",
  inputSchema: {
    categoryId: idSchema.describe("Category id from get-budget-details."),
    dryRun: dryRunSchema,
  },
  outputSchema: writeOutput(
    "category",
    budgetCategoryRowSchema.extend({
      uncategorizedEntryCount: z
        .number()
        .int()
        .describe("Entries that are now uncategorized."),
    })
  ),
  annotations: DELETE_ANNOTATIONS,
  resourceType: "budget_category",
  handler: async (args, session) => {
    const result = await deleteBudgetCategory(
      session.context,
      args.categoryId,
      options(args)
    )
    return toWriteResult(
      "category",
      result,
      {
        ...serializeBudgetCategory(result.resource),
        uncategorizedEntryCount: result.resource.uncategorizedEntryCount,
      },
      `kategorien ${result.resource.name}`,
      "delete"
    )
  },
})

// ─── Members ────────────────────────────────────────────────────

const memberOutput = writeOutput("member", budgetMemberRowSchema)

const memberOptionalInputSchema = {
  netMonthlyIncome: moneyInputSchema
    .nullable()
    .optional()
    .describe(
      "Actual monthly payout from the payslip. When set it is used instead of gross minus taxPercent. null clears it."
    ),
  notes: notesInputSchema,
}

export const createBudgetMemberTool = defineWriteTool({
  name: "create-budget-member",
  scope: "budget:write",
  title: "Add an income earner",
  description:
    "Adds a person's salary to the budget: gross monthly income and the tax percentage used to compute net income, or the actual net payout if known. Returns the member and the budget summary before and after.",
  inputSchema: {
    name: nameInputSchema.describe(
      "Label for the income row, e.g. a first name."
    ),
    grossMonthlyIncome: moneyInputSchema,
    taxPercent: percentInputSchema.describe("Effective tax rate, 0–100."),
    ...memberOptionalInputSchema,
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
    ...memberOptionalInputSchema,
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

export const deleteBudgetMemberTool = defineWriteTool({
  name: "delete-budget-member",
  scope: "budget:write",
  title: "Remove an income earner",
  description:
    "Permanently deletes one income row. Confirm with the user first, or call with dryRun to show the effect.",
  inputSchema: {
    memberId: idSchema.describe("Member id from get-budget-details."),
    dryRun: dryRunSchema,
  },
  outputSchema: memberOutput,
  annotations: DELETE_ANNOTATIONS,
  resourceType: "budget_member",
  handler: async (args, session) => {
    const result = await deleteBudgetMember(
      session.context,
      args.memberId,
      options(args)
    )
    return toWriteResult(
      "member",
      result,
      serializeBudgetMember(result.resource),
      `inntekten for ${result.resource.name}`,
      "delete"
    )
  },
})

// ─── Loans ──────────────────────────────────────────────────────

const loanOutput = writeOutput("loan", budgetLoanRowSchema)

const loanFieldsInputSchema = {
  loanType: z
    .enum(BUDGET_LOAN_TYPES)
    .optional()
    .describe(
      "MORTGAGE (boliglån), STUDENT (studielån), CAR (billån), CONSUMER (forbrukslån or credit card) or OTHER. Only MORTGAGE counts towards loan-to-value."
    ),
  repaymentType: z
    .enum(BUDGET_LOAN_REPAYMENT_TYPES)
    .optional()
    .describe("ANNUITY (equal payments) or SERIAL (equal principal)."),
  principalAmount: largeAmountInputSchema.describe(
    "Remaining balance today in NOK, not the original loan amount."
  ),
  annualInterestRate: percentInputSchema.describe(
    "Nominal yearly interest in percent, e.g. 5.25."
  ),
  termMonths: z
    .number()
    .int()
    .min(1)
    .max(600)
    .describe("Remaining term in months, e.g. 300 for 25 years."),
  monthlyFees: moneyInputSchema.optional(),
  fixedRateUntil: optionalDateInputSchema.describe(
    "YYYY-MM-DD when a fixed-rate period ends, or null for a floating rate."
  ),
  notes: notesInputSchema,
}

export const createBudgetLoanTool = defineWriteTool({
  name: "create-budget-loan",
  scope: "budget:write",
  title: "Add a loan",
  description:
    "Adds a loan; monthly interest, principal and the interest deduction are computed from today's balance. Add one loan per bank or loan part. Defaults: MORTGAGE, ANNUITY, no fees. Returns the loan and the budget summary before and after.",
  inputSchema: {
    bankName: nameInputSchema,
    loanName: nameInputSchema,
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
    "Changes the given fields of one loan, e.g. a new interest rate or balance, and leaves omitted fields unchanged. Returns the loan and the budget summary before and after.",
  inputSchema: {
    loanId: idSchema.describe("Loan id from get-budget-details."),
    bankName: nameInputSchema.optional(),
    loanName: nameInputSchema.optional(),
    loanType: loanFieldsInputSchema.loanType,
    repaymentType: loanFieldsInputSchema.repaymentType,
    principalAmount: loanFieldsInputSchema.principalAmount.optional(),
    annualInterestRate: loanFieldsInputSchema.annualInterestRate.optional(),
    termMonths: loanFieldsInputSchema.termMonths.optional(),
    monthlyFees: loanFieldsInputSchema.monthlyFees,
    fixedRateUntil: loanFieldsInputSchema.fixedRateUntil,
    notes: loanFieldsInputSchema.notes,
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

export const deleteBudgetLoanTool = defineWriteTool({
  name: "delete-budget-loan",
  scope: "budget:write",
  title: "Delete a loan",
  description:
    "Permanently deletes one loan, e.g. one that is paid off or refinanced into another. Confirm with the user first, or call with dryRun to show the effect.",
  inputSchema: {
    loanId: idSchema.describe("Loan id from get-budget-details."),
    dryRun: dryRunSchema,
  },
  outputSchema: loanOutput,
  annotations: DELETE_ANNOTATIONS,
  resourceType: "budget_loan",
  handler: async (args, session) => {
    const result = await deleteBudgetLoan(
      session.context,
      args.loanId,
      options(args)
    )
    return toWriteResult(
      "loan",
      result,
      serializeBudgetLoan(result.resource),
      `lånet ${result.resource.loanName}`,
      "delete"
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
  otherPerTrip: optionalCostSchema.describe(
    "Parking, accommodation and the like per trip. Used for every transport type."
  ),
  notes: notesInputSchema,
}

export const createBudgetTripTool = defineWriteTool({
  name: "create-budget-trip",
  scope: "budget:write",
  title: "Add a recurring trip",
  description:
    "Adds a recurring trip whose yearly cost is spread over the months. Transport costs that do not apply to the transport type are stored as null. Returns the trip and the budget summary before and after.",
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
    "Changes the given fields of one trip and leaves omitted fields unchanged. Changing transportType clears the transport costs that no longer apply. Returns the trip and the budget summary before and after.",
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

export const deleteBudgetTripTool = defineWriteTool({
  name: "delete-budget-trip",
  scope: "budget:write",
  title: "Delete a recurring trip",
  description:
    "Permanently deletes one recurring trip. Confirm with the user first, or call with dryRun to show the effect.",
  inputSchema: {
    tripId: idSchema.describe("Trip id from get-budget-details."),
    dryRun: dryRunSchema,
  },
  outputSchema: tripOutput,
  annotations: DELETE_ANNOTATIONS,
  resourceType: "budget_trip",
  handler: async (args, session) => {
    const result = await deleteBudgetTrip(
      session.context,
      args.tripId,
      options(args)
    )
    return toWriteResult(
      "trip",
      result,
      serializeBudgetTrip(result.resource),
      `reisen ${result.resource.name}`,
      "delete"
    )
  },
})

// ─── Settings ───────────────────────────────────────────────────

const budgetSettingsSchema = z.object({
  id: z.string(),
  taxDeductionPercent: storedMoneySchema.describe(
    "Percentage of loan interest that is tax deductible."
  ),
  propertyValue: storedMoneySchema.describe("Market value of the home."),
})

export const updateBudgetSettingsTool = defineWriteTool({
  name: "update-budget-settings",
  scope: "budget:write",
  title: "Update budget settings",
  description:
    "Sets budget-wide values and leaves omitted ones unchanged: the percentage of loan interest that is tax deductible (22 in Norway as of 2026) and the home's market value, which gives loan-to-value. Returns the settings and the budget summary before and after.",
  inputSchema: {
    taxDeductionPercent: percentInputSchema.optional(),
    propertyValue: largeAmountInputSchema
      .nullable()
      .optional()
      .describe("Market value of the home in NOK; null clears it."),
    expectedUpdatedAt: expectedUpdatedAtSchema,
    dryRun: dryRunSchema,
  },
  outputSchema: writeOutput("budget", budgetSettingsSchema),
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "budget",
  handler: async (args, session) => {
    const { expectedUpdatedAt, dryRun, ...fields } = args
    const result = await updateBudgetSettings(
      session.context,
      {
        ...fields,
        expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
      },
      { dryRun }
    )
    return toWriteResult(
      "budget",
      result,
      {
        id: result.resource.id,
        taxDeductionPercent: money(result.resource.taxDeductionPercent),
        propertyValue: money(result.resource.propertyValue),
      },
      "budsjettinnstillingene",
      "update"
    )
  },
})

export const budgetWriteTools: McpToolDefinition[] = [
  createBudgetEntryTool,
  addBudgetEntriesTool,
  updateBudgetEntryTool,
  deleteBudgetEntryTool,
  createBudgetCategoryTool,
  updateBudgetCategoryTool,
  deleteBudgetCategoryTool,
  createBudgetMemberTool,
  updateBudgetMemberTool,
  deleteBudgetMemberTool,
  createBudgetLoanTool,
  updateBudgetLoanTool,
  deleteBudgetLoanTool,
  createBudgetTripTool,
  updateBudgetTripTool,
  deleteBudgetTripTool,
  updateBudgetSettingsTool,
]
