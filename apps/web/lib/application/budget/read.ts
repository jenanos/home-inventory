import { db, type Prisma } from "@workspace/db"

import type { ApplicationContext } from "../context"

export type BudgetDbClient = Prisma.TransactionClient | typeof db

/**
 * The whole budget graph the shared calculation needs. Takes a client so the
 * write services can recompute the summary inside their own transaction,
 * which is what makes a dry run report exactly what a real write would.
 */
export async function getBudget(
  context: ApplicationContext,
  client: BudgetDbClient = db
) {
  return client.budget.findUnique({
    where: { householdId: context.householdId },
    include: {
      categories: { orderBy: { sortOrder: "asc" } },
      members: { orderBy: { sortOrder: "asc" } },
      loans: { orderBy: { sortOrder: "asc" } },
      trips: { orderBy: { sortOrder: "asc" } },
      entries: {
        orderBy: { sortOrder: "asc" },
        include: { category: true },
      },
    },
  })
}

// ─── Paged reads ────────────────────────────────────────────────

export const BUDGET_DETAIL_SECTIONS = [
  "members",
  "loans",
  "trips",
  "categories",
  "entries",
] as const

export type BudgetDetailSection = (typeof BUDGET_DETAIL_SECTIONS)[number]

type PageOptions = {
  limit: number
  offset: number
}

/**
 * Only `entries` is paged. Members, loans, trips and categories are bounded by
 * how a household actually uses the budget — a handful of rows each — while
 * entries is the one collection that grows without limit.
 */
export async function getBudgetDetails(
  context: ApplicationContext,
  options: PageOptions & { sections: readonly BudgetDetailSection[] }
) {
  const budget = await db.budget.findUnique({
    where: { householdId: context.householdId },
    select: {
      id: true,
      taxDeductionPercent: true,
      propertyValue: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!budget) {
    return null
  }

  const wants = (section: BudgetDetailSection) =>
    options.sections.includes(section)

  const [
    members,
    loans,
    trips,
    categories,
    entryCount,
    entries,
    mortgageCount,
  ] = await Promise.all([
    wants("members")
      ? db.budgetMember.findMany({
          where: { budgetId: budget.id },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        })
      : null,
    wants("loans")
      ? db.budgetLoan.findMany({
          where: { budgetId: budget.id },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        })
      : null,
    wants("trips")
      ? db.budgetTrip.findMany({
          where: { budgetId: budget.id },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        })
      : null,
    wants("categories")
      ? db.budgetEntryCategory.findMany({
          where: { budgetId: budget.id },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        })
      : null,
    wants("entries")
      ? db.budgetEntry.count({ where: { budgetId: budget.id } })
      : 0,
    wants("entries")
      ? db.budgetEntry.findMany({
          where: { budgetId: budget.id },
          select: {
            id: true,
            name: true,
            type: true,
            amount: true,
            frequency: true,
            provider: true,
            paymentDay: true,
            renewalDate: true,
            notes: true,
            sortOrder: true,
            updatedAt: true,
            category: { select: { id: true, name: true } },
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          skip: options.offset,
          take: options.limit,
        })
      : null,
    // Whether a property value would add anything, for `missingFields`.
    db.budgetLoan.count({
      where: { budgetId: budget.id, loanType: "MORTGAGE" },
    }),
  ])

  return {
    budget,
    members,
    loans,
    trips,
    categories,
    entries,
    entryCount,
    hasMortgage: mortgageCount > 0,
  }
}
