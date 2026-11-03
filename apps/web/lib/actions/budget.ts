"use server"

import {
  db,
  type BudgetEntryType,
  type BudgetLoanRepaymentType,
  type BudgetLoanType,
  type TripTransportType,
} from "@workspace/db"
import {
  bulkImportBudget as bulkImportBudgetService,
  bulkImportBudgetWithDuplicates as bulkImportBudgetWithDuplicatesService,
  bulkImportSize,
  createImportedBudgetRows,
  findExistingBudgetItems as findExistingBudgetItemsService,
  type BulkBudgetImportInput,
  type BulkBudgetImportWithDuplicatesInput,
  type ExistingBudgetItems,
} from "@/lib/application/budget/import"
import {
  createBudgetCategory,
  createBudgetEntry,
  createBudgetLoan,
  createBudgetMember,
  createBudgetTrip,
  deleteBudgetCategory as deleteBudgetCategoryService,
  deleteBudgetEntry as deleteBudgetEntryService,
  deleteBudgetLoan as deleteBudgetLoanService,
  deleteBudgetMember as deleteBudgetMemberService,
  deleteBudgetTrip as deleteBudgetTripService,
  ensureBudget as ensureBudgetService,
  ensureBudgetRow,
  ensureDefaultBudgetCategories,
  setTaxDeductionPercent,
  updateBudgetCategory,
  updateBudgetEntry,
  updateBudgetLoan,
  updateBudgetMember,
  updateBudgetTrip,
} from "@/lib/application/budget/write"
import { assertBatchSize } from "@/lib/application/mutations"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

export type {
  ExistingBudgetEntry,
  ExistingBudgetItems,
  ExistingBudgetLoan,
  ExistingBudgetMember,
  ExistingBudgetTrip,
} from "@/lib/application/budget/import"

/*
 * Thin adapters over the budget write services, which MCP uses too. The
 * browser context comes from the session; validation, the household boundary
 * and the transaction live in `lib/application/budget`. Only `revalidatePath`
 * stays here.
 */

function revalidateBudgetPage() {
  revalidatePath("/budsjett")
}

// ─── Budget ─────────────────────────────────────────────────────

export async function ensureBudget() {
  const { context } = await requireHousehold()
  return ensureBudgetService(context)
}

export async function updateTaxDeductionPercent(percent: number) {
  const { context } = await requireHousehold()
  await setTaxDeductionPercent(context, { percent })
  revalidateBudgetPage()
}

// ─── Budget Members ─────────────────────────────────────────────

interface UpsertBudgetMemberInput {
  id?: string
  name: string
  grossMonthlyIncome: number
  taxPercent: number
}

export async function upsertBudgetMember(input: UpsertBudgetMemberInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input

  if (id) {
    await updateBudgetMember(context, id, fields)
  } else {
    await createBudgetMember(context, fields)
  }

  revalidateBudgetPage()
}

export async function deleteBudgetMember(memberId: string) {
  const { context } = await requireHousehold()
  await deleteBudgetMemberService(context, memberId)
  revalidateBudgetPage()
}

// ─── Budget Loans ───────────────────────────────────────────────

interface UpsertBudgetLoanInput {
  id?: string
  bankName: string
  loanName: string
  loanType: BudgetLoanType
  repaymentType: BudgetLoanRepaymentType
  principalAmount: number
  annualInterestRate: number
  termMonths: number
  monthlyFees: number
}

export async function upsertBudgetLoan(input: UpsertBudgetLoanInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input

  if (id) {
    await updateBudgetLoan(context, id, fields)
  } else {
    await createBudgetLoan(context, fields)
  }

  revalidateBudgetPage()
}

export async function deleteBudgetLoan(loanId: string) {
  const { context } = await requireHousehold()
  await deleteBudgetLoanService(context, loanId)
  revalidateBudgetPage()
}

// ─── Budget Trips ───────────────────────────────────────────────

interface UpsertBudgetTripInput {
  id?: string
  name: string
  transportType: TripTransportType
  annualTrips: number
  ticketPerTrip?: number
  tollPerTrip?: number
  ferryPerTrip?: number
  fuelPerTrip?: number
}

export async function upsertBudgetTrip(input: UpsertBudgetTripInput) {
  const { context } = await requireHousehold()
  const { id, ...rest } = input
  // The dialog always sends the whole trip; an omitted cost means 0, as the
  // action has always stored it.
  const fields = {
    ...rest,
    ticketPerTrip: rest.ticketPerTrip ?? 0,
    tollPerTrip: rest.tollPerTrip ?? 0,
    ferryPerTrip: rest.ferryPerTrip ?? 0,
    fuelPerTrip: rest.fuelPerTrip ?? 0,
  }

  if (id) {
    await updateBudgetTrip(context, id, fields)
  } else {
    await createBudgetTrip(context, fields)
  }

  revalidateBudgetPage()
}

export async function deleteBudgetTrip(tripId: string) {
  const { context } = await requireHousehold()
  await deleteBudgetTripService(context, tripId)
  revalidateBudgetPage()
}

// ─── Budget Categories ───────────────────────────────────────────

interface UpsertBudgetCategoryInput {
  id?: string
  name: string
}

export async function upsertBudgetCategory(input: UpsertBudgetCategoryInput) {
  const { context } = await requireHousehold()

  if (input.id) {
    await updateBudgetCategory(context, input.id, { name: input.name })
  } else {
    await createBudgetCategory(context, { name: input.name })
  }

  revalidateBudgetPage()
}

export async function deleteBudgetCategory(categoryId: string) {
  const { context } = await requireHousehold()
  await deleteBudgetCategoryService(context, categoryId)
  revalidateBudgetPage()
}

// ─── Budget Entries ─────────────────────────────────────────────

interface UpsertBudgetEntryInput {
  id?: string
  name: string
  categoryId?: string | null
  type: BudgetEntryType
  monthlyAmount: number
}

export async function upsertBudgetEntry(input: UpsertBudgetEntryInput) {
  const { context } = await requireHousehold()
  // The dialog sends the full entry; a missing category means uncategorized.
  const { id, ...rest } = input
  const fields = { ...rest, categoryId: rest.categoryId ?? null }

  if (id) {
    await updateBudgetEntry(context, id, fields)
  } else {
    await createBudgetEntry(context, fields)
  }

  revalidateBudgetPage()
}

export async function deleteBudgetEntry(entryId: string) {
  const { context } = await requireHousehold()
  await deleteBudgetEntryService(context, entryId)
  revalidateBudgetPage()
}

// ─── Bulk Import (LLM) ──────────────────────────────────────────

export async function bulkImportBudget(input: BulkBudgetImportInput) {
  const { context } = await requireHousehold()
  const result = await bulkImportBudgetService(context, input)
  revalidateBudgetPage()
  return result
}

/**
 * Full replacement. Deliberately kept here and out of `lib/application`, so no
 * MCP tool can ever reach it (plan 10.4).
 */
export async function replaceBudget(input: BulkBudgetImportInput) {
  const { context } = await requireHousehold()
  assertBatchSize(bulkImportSize(input), "Budsjettimporten", {
    allowEmpty: true,
  })

  const count = await db.$transaction(async (tx) => {
    const budget = await ensureBudgetRow(tx, context.householdId)
    const budgetId = budget.id

    await tx.budgetMember.deleteMany({ where: { budgetId } })
    await tx.budgetLoan.deleteMany({ where: { budgetId } })
    await tx.budgetTrip.deleteMany({ where: { budgetId } })
    await tx.budgetEntry.deleteMany({ where: { budgetId } })
    await tx.budgetEntryCategory.deleteMany({ where: { budgetId } })

    const created = await createImportedBudgetRows(tx, budgetId, input, "zero")
    await ensureDefaultBudgetCategories(tx, budgetId)
    return created
  })

  revalidateBudgetPage()
  return { count }
}

export async function findExistingBudgetItems(): Promise<ExistingBudgetItems> {
  const { context } = await requireHousehold()
  return findExistingBudgetItemsService(context)
}

export async function bulkImportBudgetWithDuplicates(
  input: BulkBudgetImportWithDuplicatesInput
) {
  const { context } = await requireHousehold()
  const result = await bulkImportBudgetWithDuplicatesService(context, input)
  revalidateBudgetPage()
  return result
}
