"use server"

import type {
  BudgetEntryFields,
  BudgetLoanFields,
  BudgetMemberFields,
  BudgetSettingsInput,
  BudgetTripFields,
} from "@/lib/application/budget/write"
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
  updateBudgetCategory,
  updateBudgetEntry,
  updateBudgetLoan,
  updateBudgetMember,
  updateBudgetSettings as updateBudgetSettingsService,
  updateBudgetTrip,
} from "@/lib/application/budget/write"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

/*
 * Thin adapters over the budget write services, which MCP uses too. The
 * browser context comes from the session; validation, the household boundary
 * and the transaction live in `lib/application/budget`. Only `revalidatePath`
 * stays here.
 *
 * The dialogs always send the whole row, so an optional field that is left
 * empty arrives as null and clears the stored value.
 */

function revalidateBudgetPages() {
  revalidatePath("/budsjett")
  revalidatePath("/")
}

// ─── Budget ─────────────────────────────────────────────────────

export async function ensureBudget() {
  const { context } = await requireHousehold()
  return ensureBudgetService(context)
}

export async function updateBudgetSettings(
  input: Omit<BudgetSettingsInput, "expectedUpdatedAt">
) {
  const { context } = await requireHousehold()
  await updateBudgetSettingsService(context, input)
  revalidateBudgetPages()
}

// ─── Budget Members ─────────────────────────────────────────────

type WithId<T> = T & { id?: string }

export async function upsertBudgetMember(input: WithId<BudgetMemberFields>) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input

  if (id) {
    await updateBudgetMember(context, id, fields)
  } else {
    await createBudgetMember(context, fields)
  }

  revalidateBudgetPages()
}

export async function deleteBudgetMember(memberId: string) {
  const { context } = await requireHousehold()
  await deleteBudgetMemberService(context, memberId)
  revalidateBudgetPages()
}

// ─── Budget Loans ───────────────────────────────────────────────

export async function upsertBudgetLoan(input: WithId<BudgetLoanFields>) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input

  if (id) {
    await updateBudgetLoan(context, id, fields)
  } else {
    await createBudgetLoan(context, fields)
  }

  revalidateBudgetPages()
}

export async function deleteBudgetLoan(loanId: string) {
  const { context } = await requireHousehold()
  await deleteBudgetLoanService(context, loanId)
  revalidateBudgetPages()
}

// ─── Budget Trips ───────────────────────────────────────────────

export async function upsertBudgetTrip(input: WithId<BudgetTripFields>) {
  const { context } = await requireHousehold()
  const { id, ...rest } = input
  // An omitted transport cost means 0, as the action has always stored it.
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

  revalidateBudgetPages()
}

export async function deleteBudgetTrip(tripId: string) {
  const { context } = await requireHousehold()
  await deleteBudgetTripService(context, tripId)
  revalidateBudgetPages()
}

// ─── Budget Categories ───────────────────────────────────────────

export async function upsertBudgetCategory(input: {
  id?: string
  name: string
}) {
  const { context } = await requireHousehold()

  if (input.id) {
    await updateBudgetCategory(context, input.id, { name: input.name })
  } else {
    await createBudgetCategory(context, { name: input.name })
  }

  revalidateBudgetPages()
}

export async function deleteBudgetCategory(categoryId: string) {
  const { context } = await requireHousehold()
  await deleteBudgetCategoryService(context, categoryId)
  revalidateBudgetPages()
}

// ─── Budget Entries ─────────────────────────────────────────────

export async function upsertBudgetEntry(input: WithId<BudgetEntryFields>) {
  const { context } = await requireHousehold()
  // A missing category means uncategorized.
  const { id, ...rest } = input
  const fields = { ...rest, categoryId: rest.categoryId ?? null }

  if (id) {
    await updateBudgetEntry(context, id, fields)
  } else {
    await createBudgetEntry(context, fields)
  }

  revalidateBudgetPages()
}

export async function deleteBudgetEntry(entryId: string) {
  const { context } = await requireHousehold()
  await deleteBudgetEntryService(context, entryId)
  revalidateBudgetPages()
}
