"use server"

import { db, type BudgetCategory, type BudgetEntryType } from "@workspace/db"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

// ─── Budget ─────────────────────────────────────────────────────

export async function ensureBudget() {
  const { membership } = await requireHousehold()

  const existing = await db.budget.findUnique({
    where: { householdId: membership.householdId },
  })

  if (existing) return existing

  const budget = await db.budget.create({
    data: { householdId: membership.householdId },
  })

  revalidatePath("/budsjett")
  return budget
}

export async function updateTaxDeductionPercent(percent: number) {
  const { membership } = await requireHousehold()

  const budget = await db.budget.findUnique({
    where: { householdId: membership.householdId },
  })
  if (!budget) throw new Error("Budget not found")

  await db.budget.update({
    where: { id: budget.id },
    data: { taxDeductionPercent: percent },
  })

  revalidatePath("/budsjett")
}

// ─── Budget Members ─────────────────────────────────────────────

interface UpsertBudgetMemberInput {
  id?: string
  name: string
  grossMonthlyIncome: number
  taxPercent: number
}

export async function upsertBudgetMember(input: UpsertBudgetMemberInput) {
  const { membership } = await requireHousehold()

  const budget = await db.budget.findUnique({
    where: { householdId: membership.householdId },
  })
  if (!budget) throw new Error("Budget not found")

  if (input.id) {
    const member = await db.budgetMember.findUnique({
      where: { id: input.id },
    })
    if (!member || member.budgetId !== budget.id)
      throw new Error("Member not found")

    await db.budgetMember.update({
      where: { id: input.id },
      data: {
        name: input.name,
        grossMonthlyIncome: input.grossMonthlyIncome,
        taxPercent: input.taxPercent,
      },
    })
  } else {
    const count = await db.budgetMember.count({
      where: { budgetId: budget.id },
    })
    await db.budgetMember.create({
      data: {
        budgetId: budget.id,
        name: input.name,
        grossMonthlyIncome: input.grossMonthlyIncome,
        taxPercent: input.taxPercent,
        sortOrder: count,
      },
    })
  }

  revalidatePath("/budsjett")
}

export async function deleteBudgetMember(memberId: string) {
  const { membership } = await requireHousehold()

  const budget = await db.budget.findUnique({
    where: { householdId: membership.householdId },
  })
  if (!budget) throw new Error("Budget not found")

  const member = await db.budgetMember.findUnique({
    where: { id: memberId },
  })
  if (!member || member.budgetId !== budget.id)
    throw new Error("Member not found")

  await db.budgetMember.delete({ where: { id: memberId } })

  revalidatePath("/budsjett")
}

// ─── Budget Loans ───────────────────────────────────────────────

interface UpsertBudgetLoanInput {
  id?: string
  bankName: string
  loanName: string
  monthlyInterest: number
  monthlyPrincipal: number
  monthlyFees: number
}

export async function upsertBudgetLoan(input: UpsertBudgetLoanInput) {
  const { membership } = await requireHousehold()

  const budget = await db.budget.findUnique({
    where: { householdId: membership.householdId },
  })
  if (!budget) throw new Error("Budget not found")

  if (input.id) {
    const loan = await db.budgetLoan.findUnique({ where: { id: input.id } })
    if (!loan || loan.budgetId !== budget.id) throw new Error("Loan not found")

    await db.budgetLoan.update({
      where: { id: input.id },
      data: {
        bankName: input.bankName,
        loanName: input.loanName,
        monthlyInterest: input.monthlyInterest,
        monthlyPrincipal: input.monthlyPrincipal,
        monthlyFees: input.monthlyFees,
      },
    })
  } else {
    const count = await db.budgetLoan.count({
      where: { budgetId: budget.id },
    })
    await db.budgetLoan.create({
      data: {
        budgetId: budget.id,
        bankName: input.bankName,
        loanName: input.loanName,
        monthlyInterest: input.monthlyInterest,
        monthlyPrincipal: input.monthlyPrincipal,
        monthlyFees: input.monthlyFees,
        sortOrder: count,
      },
    })
  }

  revalidatePath("/budsjett")
}

export async function deleteBudgetLoan(loanId: string) {
  const { membership } = await requireHousehold()

  const budget = await db.budget.findUnique({
    where: { householdId: membership.householdId },
  })
  if (!budget) throw new Error("Budget not found")

  const loan = await db.budgetLoan.findUnique({ where: { id: loanId } })
  if (!loan || loan.budgetId !== budget.id) throw new Error("Loan not found")

  await db.budgetLoan.delete({ where: { id: loanId } })

  revalidatePath("/budsjett")
}

// ─── Budget Entries ─────────────────────────────────────────────

interface UpsertBudgetEntryInput {
  id?: string
  name: string
  category?: BudgetCategory | null
  type: BudgetEntryType
  monthlyAmount: number
}

export async function upsertBudgetEntry(input: UpsertBudgetEntryInput) {
  const { membership } = await requireHousehold()

  const budget = await db.budget.findUnique({
    where: { householdId: membership.householdId },
  })
  if (!budget) throw new Error("Budget not found")

  if (input.id) {
    const entry = await db.budgetEntry.findUnique({ where: { id: input.id } })
    if (!entry || entry.budgetId !== budget.id)
      throw new Error("Entry not found")

    await db.budgetEntry.update({
      where: { id: input.id },
      data: {
        name: input.name,
        category: input.category ?? null,
        type: input.type,
        monthlyAmount: input.monthlyAmount,
      },
    })
  } else {
    const count = await db.budgetEntry.count({
      where: { budgetId: budget.id },
    })
    await db.budgetEntry.create({
      data: {
        budgetId: budget.id,
        name: input.name,
        category: input.category ?? null,
        type: input.type,
        monthlyAmount: input.monthlyAmount,
        sortOrder: count,
      },
    })
  }

  revalidatePath("/budsjett")
}

export async function deleteBudgetEntry(entryId: string) {
  const { membership } = await requireHousehold()

  const budget = await db.budget.findUnique({
    where: { householdId: membership.householdId },
  })
  if (!budget) throw new Error("Budget not found")

  const entry = await db.budgetEntry.findUnique({ where: { id: entryId } })
  if (!entry || entry.budgetId !== budget.id)
    throw new Error("Entry not found")

  await db.budgetEntry.delete({ where: { id: entryId } })

  revalidatePath("/budsjett")
}
