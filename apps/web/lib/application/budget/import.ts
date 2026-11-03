import {
  db,
  type BudgetEntryType,
  type BudgetLoanRepaymentType,
  type BudgetLoanType,
  type Prisma,
  type TripTransportType,
} from "@workspace/db"

import type { ApplicationContext } from "../context"
import { assertBatchSize, scopedWrite } from "../mutations"
import type { BudgetDbClient } from "./read"
import { ensureBudgetRow, normalizeBudgetCategoryName } from "./write"

/**
 * The LLM import flows on the budget page (web only, never an MCP tool).
 *
 * Enum normalization here is deliberately lenient: the input is pasted model
 * output, the import page already validates entry and trip types and shows
 * the errors before submitting, and these helpers are a defensive second
 * layer. They upper-case values, default loan and repayment types, and skip
 * entries/trips whose type is still unrecognized. The write services in
 * `write.ts`, which MCP uses, reject unknown values instead.
 *
 * Every update is scoped to the caller's budget: an id from another household
 * fails the whole import with NOT_FOUND and nothing is written.
 */

type Tx = Prisma.TransactionClient

const VALID_ENTRY_TYPES = new Set<string>(["INCOME", "EXPENSE", "DEDUCTION"])
const VALID_LOAN_TYPES = new Set<string>(["MORTGAGE", "OTHER"])
const VALID_REPAYMENT_TYPES = new Set<string>(["ANNUITY", "SERIAL"])
const VALID_TRIP_TYPES = new Set<string>(["AIR_OR_PUBLIC", "CAR"])

export function normalizeImportedEntryType(type: string) {
  const value = type.toUpperCase()
  return VALID_ENTRY_TYPES.has(value) ? (value as BudgetEntryType) : null
}

export function normalizeImportedLoanType(type?: string) {
  const value = (type ?? "MORTGAGE").toUpperCase()
  return VALID_LOAN_TYPES.has(value) ? (value as BudgetLoanType) : "MORTGAGE"
}

export function normalizeImportedRepaymentType(type?: string) {
  const value = (type ?? "ANNUITY").toUpperCase()
  return VALID_REPAYMENT_TYPES.has(value)
    ? (value as BudgetLoanRepaymentType)
    : "ANNUITY"
}

export function normalizeImportedTripType(type: string) {
  const value = type.toUpperCase()
  return VALID_TRIP_TYPES.has(value) ? (value as TripTransportType) : null
}

export function importedTermMonths(value: number) {
  return Math.max(1, Math.round(value || 1))
}

export function importedAnnualTrips(value: number) {
  return Math.max(1, Math.round(value || 1))
}

// ─── Category resolution by name ────────────────────────────────

export type BudgetCategoryCache = {
  items: Array<{ id: string; name: string }>
  nextSortOrder: number
}

const budgetCategoryNameCollator = new Intl.Collator("nb-NO", {
  sensitivity: "base",
})

export async function createBudgetCategoryCache(
  client: BudgetDbClient,
  budgetId: string
): Promise<BudgetCategoryCache> {
  const categories = await client.budgetEntryCategory.findMany({
    where: { budgetId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  })

  return { items: categories, nextSortOrder: categories.length }
}

/** Finds a category by name within the budget, creating it if missing. */
export async function resolveBudgetCategoryId(
  client: BudgetDbClient,
  budgetId: string,
  categoryName: string | null | undefined,
  cache: BudgetCategoryCache
) {
  if (!categoryName) return null

  const name = normalizeBudgetCategoryName(categoryName)
  if (!name) return null

  const cached = cache.items.find(
    (category) => budgetCategoryNameCollator.compare(category.name, name) === 0
  )
  if (cached) return cached.id

  const existing = await client.budgetEntryCategory.findFirst({
    where: { budgetId, name: { equals: name, mode: "insensitive" } },
  })
  if (existing) {
    cache.items.push({ id: existing.id, name: existing.name })
    return existing.id
  }

  const created = await client.budgetEntryCategory.create({
    data: { budgetId, name, sortOrder: cache.nextSortOrder },
  })
  cache.items.push({ id: created.id, name: created.name })
  cache.nextSortOrder += 1

  return created.id
}

// ─── Input types ────────────────────────────────────────────────

export interface BulkBudgetMemberInput {
  name: string
  grossMonthlyIncome: number
  taxPercent: number
}

export interface BulkBudgetLoanInput {
  bankName: string
  loanName: string
  loanType?: string
  repaymentType?: string
  principalAmount: number
  annualInterestRate: number
  termMonths: number
  monthlyFees?: number
}

export interface BulkBudgetTripInput {
  name: string
  transportType: string
  annualTrips: number
  ticketPerTrip?: number
  tollPerTrip?: number
  ferryPerTrip?: number
  fuelPerTrip?: number
}

export interface BulkBudgetEntryInput {
  name: string
  category?: string
  type: string
  monthlyAmount: number
}

export interface BulkBudgetImportInput {
  members?: BulkBudgetMemberInput[]
  loans?: BulkBudgetLoanInput[]
  trips?: BulkBudgetTripInput[]
  entries?: BulkBudgetEntryInput[]
}

export function bulkImportSize(input: BulkBudgetImportInput) {
  return (
    (input.members?.length ?? 0) +
    (input.loans?.length ?? 0) +
    (input.trips?.length ?? 0) +
    (input.entries?.length ?? 0)
  )
}

// ─── Row creation shared by import and replace ──────────────────

/**
 * Creates the imported rows after any existing ones. Used by the additive
 * import here and by `replaceBudget`, which stays a server action outside the
 * application layer so it can never be reached from MCP (plan 10.4).
 */
export async function createImportedBudgetRows(
  tx: Tx,
  budgetId: string,
  input: BulkBudgetImportInput,
  startAt: "end" | "zero"
) {
  let count = 0
  const firstSortOrder = async (count: () => Promise<number>) =>
    startAt === "zero" ? 0 : count()

  if (input.members?.length) {
    let sortOrder = await firstSortOrder(() =>
      tx.budgetMember.count({ where: { budgetId } })
    )
    for (const member of input.members) {
      await tx.budgetMember.create({
        data: {
          budgetId,
          name: member.name,
          grossMonthlyIncome: member.grossMonthlyIncome,
          taxPercent: member.taxPercent,
          sortOrder: sortOrder++,
        },
      })
      count += 1
    }
  }

  if (input.loans?.length) {
    let sortOrder = await firstSortOrder(() =>
      tx.budgetLoan.count({ where: { budgetId } })
    )
    for (const loan of input.loans) {
      await tx.budgetLoan.create({
        data: {
          budgetId,
          bankName: loan.bankName,
          loanName: loan.loanName,
          loanType: normalizeImportedLoanType(loan.loanType),
          repaymentType: normalizeImportedRepaymentType(loan.repaymentType),
          principalAmount: loan.principalAmount,
          annualInterestRate: loan.annualInterestRate,
          termMonths: importedTermMonths(loan.termMonths),
          monthlyFees: loan.monthlyFees ?? 0,
          sortOrder: sortOrder++,
        },
      })
      count += 1
    }
  }

  if (input.trips?.length) {
    let sortOrder = await firstSortOrder(() =>
      tx.budgetTrip.count({ where: { budgetId } })
    )
    for (const trip of input.trips) {
      const tripType = normalizeImportedTripType(trip.transportType)
      if (!tripType) continue

      await tx.budgetTrip.create({
        data: {
          budgetId,
          name: trip.name,
          transportType: tripType,
          annualTrips: importedAnnualTrips(trip.annualTrips),
          ticketPerTrip:
            tripType === "AIR_OR_PUBLIC" ? (trip.ticketPerTrip ?? 0) : null,
          tollPerTrip: tripType === "CAR" ? (trip.tollPerTrip ?? 0) : null,
          ferryPerTrip: tripType === "CAR" ? (trip.ferryPerTrip ?? 0) : null,
          fuelPerTrip: tripType === "CAR" ? (trip.fuelPerTrip ?? 0) : null,
          sortOrder: sortOrder++,
        },
      })
      count += 1
    }
  }

  if (input.entries?.length) {
    const categoryCache = await createBudgetCategoryCache(tx, budgetId)
    let sortOrder = await firstSortOrder(() =>
      tx.budgetEntry.count({ where: { budgetId } })
    )
    for (const entry of input.entries) {
      const entryType = normalizeImportedEntryType(entry.type)
      if (!entryType) continue

      await tx.budgetEntry.create({
        data: {
          budgetId,
          name: entry.name,
          categoryId: await resolveBudgetCategoryId(
            tx,
            budgetId,
            entry.category,
            categoryCache
          ),
          type: entryType,
          monthlyAmount: entry.monthlyAmount,
          sortOrder: sortOrder++,
        },
      })
      count += 1
    }
  }

  return count
}

// ─── Additive import ────────────────────────────────────────────

export async function bulkImportBudget(
  context: ApplicationContext,
  input: BulkBudgetImportInput
) {
  assertBatchSize(bulkImportSize(input), "Budsjettimporten")

  const count = await db.$transaction(async (tx) => {
    const budget = await ensureBudgetRow(tx, context.householdId)
    return createImportedBudgetRows(tx, budget.id, input, "end")
  })

  return { count }
}

// ─── Duplicate detection ────────────────────────────────────────

export interface ExistingBudgetMember {
  id: string
  name: string
  grossMonthlyIncome: number
  taxPercent: number
}

export interface ExistingBudgetLoan {
  id: string
  bankName: string
  loanName: string
  loanType: string
  repaymentType: string
  principalAmount: number
  annualInterestRate: number
  termMonths: number
  monthlyFees: number
}

export interface ExistingBudgetTrip {
  id: string
  name: string
  transportType: string
  annualTrips: number
  ticketPerTrip: number | null
  tollPerTrip: number | null
  ferryPerTrip: number | null
  fuelPerTrip: number | null
}

export interface ExistingBudgetEntry {
  id: string
  name: string
  category: string | null
  type: string
  monthlyAmount: number
}

export interface ExistingBudgetItems {
  members: ExistingBudgetMember[]
  loans: ExistingBudgetLoan[]
  trips: ExistingBudgetTrip[]
  entries: ExistingBudgetEntry[]
}

function optionalNumber(value: { toString(): string } | null) {
  return value ? Number(value) : null
}

export async function findExistingBudgetItems(
  context: ApplicationContext
): Promise<ExistingBudgetItems> {
  const budget = await db.budget.findUnique({
    where: { householdId: context.householdId },
    include: {
      members: true,
      loans: true,
      trips: true,
      entries: { include: { category: true } },
    },
  })

  if (!budget) return { members: [], loans: [], trips: [], entries: [] }

  return {
    members: budget.members.map((member) => ({
      id: member.id,
      name: member.name,
      grossMonthlyIncome: Number(member.grossMonthlyIncome),
      taxPercent: Number(member.taxPercent),
    })),
    loans: budget.loans.map((loan) => ({
      id: loan.id,
      bankName: loan.bankName,
      loanName: loan.loanName,
      loanType: loan.loanType,
      repaymentType: loan.repaymentType,
      principalAmount: Number(loan.principalAmount),
      annualInterestRate: Number(loan.annualInterestRate),
      termMonths: loan.termMonths,
      monthlyFees: Number(loan.monthlyFees),
    })),
    trips: budget.trips.map((trip) => ({
      id: trip.id,
      name: trip.name,
      transportType: trip.transportType,
      annualTrips: trip.annualTrips,
      ticketPerTrip: optionalNumber(trip.ticketPerTrip),
      tollPerTrip: optionalNumber(trip.tollPerTrip),
      ferryPerTrip: optionalNumber(trip.ferryPerTrip),
      fuelPerTrip: optionalNumber(trip.fuelPerTrip),
    })),
    entries: budget.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      category: entry.category?.name ?? null,
      type: entry.type,
      monthlyAmount: Number(entry.monthlyAmount),
    })),
  }
}

// ─── Import with duplicate handling ─────────────────────────────

interface FieldUpdate<TFields> {
  id: string
  fields: TFields
}

export interface BulkBudgetImportWithDuplicatesInput {
  newMembers?: BulkBudgetMemberInput[]
  memberUpdates?: FieldUpdate<{
    grossMonthlyIncome?: number
    taxPercent?: number
  }>[]
  newLoans?: BulkBudgetLoanInput[]
  loanUpdates?: FieldUpdate<{
    bankName?: string
    loanType?: string
    repaymentType?: string
    principalAmount?: number
    annualInterestRate?: number
    termMonths?: number
    monthlyFees?: number
  }>[]
  newTrips?: BulkBudgetTripInput[]
  tripUpdates?: FieldUpdate<{
    transportType?: string
    annualTrips?: number
    ticketPerTrip?: number | null
    tollPerTrip?: number | null
    ferryPerTrip?: number | null
    fuelPerTrip?: number | null
  }>[]
  newEntries?: BulkBudgetEntryInput[]
  entryUpdates?: FieldUpdate<{
    category?: string | null
    monthlyAmount?: number
  }>[]
}

function withDuplicatesSize(input: BulkBudgetImportWithDuplicatesInput) {
  return (
    bulkImportSize({
      members: input.newMembers,
      loans: input.newLoans,
      trips: input.newTrips,
      entries: input.newEntries,
    }) +
    (input.memberUpdates?.length ?? 0) +
    (input.loanUpdates?.length ?? 0) +
    (input.tripUpdates?.length ?? 0) +
    (input.entryUpdates?.length ?? 0)
  )
}

/**
 * Each update's `where` carries the caller's budget id. Before this was moved
 * here the updates matched on `id` alone, so a crafted call could change
 * another household's budget rows.
 */
function scopedImportUpdate(resource: string, write: () => Promise<unknown>) {
  return scopedWrite({ resource, write })
}

export async function bulkImportBudgetWithDuplicates(
  context: ApplicationContext,
  input: BulkBudgetImportWithDuplicatesInput
) {
  assertBatchSize(withDuplicatesSize(input), "Budsjettimporten", {
    allowEmpty: true,
  })

  const count = await db.$transaction(async (tx) => {
    const budget = await ensureBudgetRow(tx, context.householdId)
    const budgetId = budget.id

    let count = await createImportedBudgetRows(
      tx,
      budgetId,
      {
        members: input.newMembers,
        loans: input.newLoans,
        trips: input.newTrips,
        entries: input.newEntries,
      },
      "end"
    )

    for (const update of input.memberUpdates ?? []) {
      await scopedImportUpdate("budsjettmedlem", () =>
        tx.budgetMember.update({
          where: { id: update.id, budgetId },
          data: {
            grossMonthlyIncome: update.fields.grossMonthlyIncome,
            taxPercent: update.fields.taxPercent,
          },
        })
      )
      count += 1
    }

    for (const update of input.loanUpdates ?? []) {
      const fields = update.fields
      await scopedImportUpdate("lån", () =>
        tx.budgetLoan.update({
          where: { id: update.id, budgetId },
          data: {
            bankName: fields.bankName,
            loanType:
              fields.loanType === undefined
                ? undefined
                : normalizeImportedLoanType(fields.loanType),
            repaymentType:
              fields.repaymentType === undefined
                ? undefined
                : normalizeImportedRepaymentType(fields.repaymentType),
            principalAmount: fields.principalAmount,
            annualInterestRate: fields.annualInterestRate,
            termMonths:
              fields.termMonths === undefined
                ? undefined
                : Math.max(1, Math.round(fields.termMonths)),
            monthlyFees: fields.monthlyFees,
          },
        })
      )
      count += 1
    }

    for (const update of input.tripUpdates ?? []) {
      const fields = update.fields
      const tripType =
        fields.transportType === undefined
          ? undefined
          : (normalizeImportedTripType(fields.transportType) ?? undefined)

      await scopedImportUpdate("reise", () =>
        tx.budgetTrip.update({
          where: { id: update.id, budgetId },
          data: {
            transportType: tripType,
            annualTrips:
              fields.annualTrips === undefined
                ? undefined
                : Math.max(1, Math.round(fields.annualTrips)),
            ticketPerTrip: fields.ticketPerTrip,
            tollPerTrip: fields.tollPerTrip,
            ferryPerTrip: fields.ferryPerTrip,
            fuelPerTrip: fields.fuelPerTrip,
          },
        })
      )
      count += 1
    }

    if (input.entryUpdates?.length) {
      const categoryCache = await createBudgetCategoryCache(tx, budgetId)

      for (const update of input.entryUpdates) {
        const categoryId =
          update.fields.category === undefined
            ? undefined
            : await resolveBudgetCategoryId(
                tx,
                budgetId,
                update.fields.category,
                categoryCache
              )

        await scopedImportUpdate("budsjettpost", () =>
          tx.budgetEntry.update({
            where: { id: update.id, budgetId },
            data: { categoryId, monthlyAmount: update.fields.monthlyAmount },
          })
        )
        count += 1
      }
    }

    return count
  })

  return { count }
}
