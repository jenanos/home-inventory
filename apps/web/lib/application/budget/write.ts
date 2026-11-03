import {
  BudgetEntryType,
  BudgetLoanRepaymentType,
  BudgetLoanType,
  TripTransportType,
  db,
  type Prisma,
} from "@workspace/db"

import type { ApplicationContext } from "../context"
import { ApplicationError } from "../errors"
import {
  definedFields,
  enumValue,
  freshness,
  integerInRange,
  isUniqueConstraintError,
  moneyAmount,
  notFound,
  numberInRange,
  optionalMoneyAmount,
  requiredText,
  scopedWrite,
  validationError,
} from "../mutations"
import { calculateBudgetStats } from "./calculations"
import { getBudget, type BudgetDbClient } from "./read"

/**
 * Budget write services, shared by the web flow and MCP.
 *
 * Every write runs in one interactive transaction that (1) computes the summary
 * before, (2) creates the household's budget row if it does not exist yet, (3)
 * performs the scoped mutation and (4) recomputes the summary with the same
 * shared calculation the UI uses. A dry run rolls the transaction back after
 * step 4, so a preview is exactly what the real write would have produced,
 * without a separate preview code path or a stored preview id.
 *
 * Ownership is enforced in each statement's `where` (`budgetId` of the
 * caller's household, or `budget: { householdId }`), never by reading a row
 * by id and comparing afterwards.
 */

type Tx = Prisma.TransactionClient

const DEFAULT_BUDGET_CATEGORY_NAMES = [
  "Boligkostnader",
  "Faste kostnader",
] as const

const ENTRY_TYPES = Object.values(BudgetEntryType)
const LOAN_TYPES = Object.values(BudgetLoanType)
const REPAYMENT_TYPES = Object.values(BudgetLoanRepaymentType)
const TRIP_TYPES = Object.values(TripTransportType)

/** `Decimal(14, 2)` on `BudgetLoan.principalAmount`. */
const MAX_PRINCIPAL_AMOUNT = 999_999_999_999.99
const MAX_TERM_MONTHS = 600
const MAX_ANNUAL_TRIPS = 1000

export type BudgetSummary = ReturnType<typeof calculateBudgetStats>

export type BudgetWriteOptions = {
  /** Run the write and recompute the summary, then roll everything back. */
  dryRun?: boolean
}

export type BudgetWriteResult<T> = {
  resource: T
  summaryBefore: BudgetSummary
  summaryAfter: BudgetSummary
  dryRun: boolean
}

class DryRunRollback extends Error {
  constructor(readonly outcome: unknown) {
    super("Budget dry run rolled back")
    this.name = "DryRunRollback"
  }
}

// ─── Budget row ─────────────────────────────────────────────────

export async function ensureDefaultBudgetCategories(
  client: BudgetDbClient,
  budgetId: string
) {
  const [categoryCount, entryCount] = await Promise.all([
    client.budgetEntryCategory.count({ where: { budgetId } }),
    client.budgetEntry.count({ where: { budgetId } }),
  ])

  if (categoryCount > 0 || entryCount > 0) return

  await client.budgetEntryCategory.createMany({
    data: DEFAULT_BUDGET_CATEGORY_NAMES.map((name, index) => ({
      budgetId,
      name,
      sortOrder: index,
    })),
  })
}

/**
 * Creates the household's budget on first use. A household without a budget
 * reads as `hasBudget: false`; the first write creates the row implicitly,
 * with the same default categories the web page has always created.
 */
export async function ensureBudgetRow(
  client: BudgetDbClient,
  householdId: string
) {
  const budget = await client.budget.upsert({
    where: { householdId },
    update: {},
    create: { householdId },
  })

  await ensureDefaultBudgetCategories(client, budget.id)

  return budget
}

export async function ensureBudget(context: ApplicationContext) {
  return db.$transaction((tx) => ensureBudgetRow(tx, context.householdId))
}

async function runBudgetWrite<T>(
  context: ApplicationContext,
  options: BudgetWriteOptions,
  mutate: (tx: Tx, budgetId: string) => Promise<T>
): Promise<BudgetWriteResult<T>> {
  const dryRun = options.dryRun ?? false

  try {
    return await db.$transaction(async (tx) => {
      const summaryBefore = calculateBudgetStats(await getBudget(context, tx))
      const budget = await ensureBudgetRow(tx, context.householdId)
      const resource = await mutate(tx, budget.id)
      const summaryAfter = calculateBudgetStats(await getBudget(context, tx))
      const outcome: BudgetWriteResult<T> = {
        resource,
        summaryBefore,
        summaryAfter,
        dryRun,
      }

      if (dryRun) {
        // Throwing is how an interactive transaction is rolled back.
        throw new DryRunRollback(outcome)
      }

      return outcome
    })
  } catch (error) {
    if (error instanceof DryRunRollback) {
      return error.outcome as BudgetWriteResult<T>
    }
    throw error
  }
}

/**
 * Server actions are public endpoints, so a "required" field can still arrive
 * missing at runtime; the service checks rather than trusting the type.
 */
function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw validationError(`${field} er påkrevd.`)
  }
  return value
}

function percent(value: number, field: string) {
  return (
    Math.round(numberInRange(value, field, { min: 0, max: 100 }) * 100) / 100
  )
}

export async function setTaxDeductionPercent(
  context: ApplicationContext,
  input: { percent: number; expectedUpdatedAt?: Date },
  options: BudgetWriteOptions = {}
) {
  const taxDeductionPercent = percent(input.percent, "Rentefradrag")

  return runBudgetWrite(context, options, (tx, budgetId) =>
    scopedWrite({
      resource: "budsjett",
      expectedUpdatedAt: input.expectedUpdatedAt,
      write: () =>
        tx.budget.update({
          where: { id: budgetId, ...freshness(input.expectedUpdatedAt) },
          data: { taxDeductionPercent },
        }),
      existsInScope: async () => true,
    })
  )
}

// ─── Entries ────────────────────────────────────────────────────

export type BudgetEntryFields = {
  name: string
  /** A category of the same budget, or null for uncategorized. */
  categoryId?: string | null
  type: BudgetEntryType
  monthlyAmount: number
}

export type UpdateBudgetEntryInput = Partial<BudgetEntryFields> & {
  expectedUpdatedAt?: Date
}

function normalizeEntryFields(input: Partial<BudgetEntryFields>) {
  return definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    type:
      input.type === undefined
        ? undefined
        : enumValue(input.type, ENTRY_TYPES, "Type"),
    monthlyAmount:
      input.monthlyAmount === undefined
        ? undefined
        : moneyAmount(input.monthlyAmount, "Månedlig beløp"),
  })
}

async function assertCategoryInBudget(
  tx: Tx,
  budgetId: string,
  categoryId: string | null | undefined
) {
  if (!categoryId) return
  const count = await tx.budgetEntryCategory.count({
    where: { id: categoryId, budgetId },
  })
  if (count === 0) {
    throw notFound("budsjettkategori")
  }
}

export async function createBudgetEntry(
  context: ApplicationContext,
  input: BudgetEntryFields,
  options: BudgetWriteOptions = {}
) {
  const fields = normalizeEntryFields(input)
  const data = {
    name: required(fields.name, "Navn"),
    type: required(fields.type, "Type"),
    monthlyAmount: required(fields.monthlyAmount, "Månedlig beløp"),
  }

  return runBudgetWrite(context, options, async (tx, budgetId) => {
    await assertCategoryInBudget(tx, budgetId, input.categoryId)
    const sortOrder = await tx.budgetEntry.count({ where: { budgetId } })

    return tx.budgetEntry.create({
      data: {
        ...data,
        categoryId: input.categoryId ?? null,
        budgetId,
        sortOrder,
      },
      include: { category: { select: { id: true, name: true } } },
    })
  })
}

export async function updateBudgetEntry(
  context: ApplicationContext,
  entryId: string,
  input: UpdateBudgetEntryInput,
  options: BudgetWriteOptions = {}
) {
  const { expectedUpdatedAt, categoryId, ...rest } = input
  const fields = normalizeEntryFields(rest)

  return runBudgetWrite(context, options, async (tx, budgetId) => {
    await assertCategoryInBudget(tx, budgetId, categoryId)
    const scope = { id: entryId, budgetId }

    return scopedWrite({
      resource: "budsjettpost",
      expectedUpdatedAt,
      write: () =>
        tx.budgetEntry.update({
          where: { ...scope, ...freshness(expectedUpdatedAt) },
          data: definedFields({ ...fields, categoryId }),
          include: { category: { select: { id: true, name: true } } },
        }),
      existsInScope: async () =>
        (await tx.budgetEntry.count({ where: scope })) > 0,
    })
  })
}

// ─── Categories ─────────────────────────────────────────────────

export function normalizeBudgetCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ")
}

function duplicateCategory(name: string) {
  return new ApplicationError(
    "CONFLICT",
    `Det finnes allerede en budsjettkategori som heter «${name}».`
  )
}

async function writeCategory<T>(name: string, write: () => Promise<T>) {
  try {
    return await write()
  } catch (error) {
    // The unique index is case-sensitive; the explicit check below catches
    // case-insensitive duplicates, this catches a concurrent exact one.
    if (isUniqueConstraintError(error)) throw duplicateCategory(name)
    throw error
  }
}

async function assertCategoryNameFree(
  tx: Tx,
  budgetId: string,
  name: string,
  exceptId?: string
) {
  const duplicate = await tx.budgetEntryCategory.findFirst({
    where: {
      budgetId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })
  if (duplicate) throw duplicateCategory(name)
}

export async function createBudgetCategory(
  context: ApplicationContext,
  input: { name: string },
  options: BudgetWriteOptions = {}
) {
  const name = requiredText(normalizeBudgetCategoryName(input.name), "Navn")

  return runBudgetWrite(context, options, async (tx, budgetId) => {
    await assertCategoryNameFree(tx, budgetId, name)
    const sortOrder = await tx.budgetEntryCategory.count({
      where: { budgetId },
    })

    return writeCategory(name, () =>
      tx.budgetEntryCategory.create({ data: { budgetId, name, sortOrder } })
    )
  })
}

export async function updateBudgetCategory(
  context: ApplicationContext,
  categoryId: string,
  input: { name: string; expectedUpdatedAt?: Date },
  options: BudgetWriteOptions = {}
) {
  const name = requiredText(normalizeBudgetCategoryName(input.name), "Navn")

  return runBudgetWrite(context, options, async (tx, budgetId) => {
    const scope = { id: categoryId, budgetId }
    await assertCategoryNameFree(tx, budgetId, name, categoryId)

    return scopedWrite({
      resource: "budsjettkategori",
      expectedUpdatedAt: input.expectedUpdatedAt,
      write: () =>
        writeCategory(name, () =>
          tx.budgetEntryCategory.update({
            where: { ...scope, ...freshness(input.expectedUpdatedAt) },
            data: { name },
          })
        ),
      existsInScope: async () =>
        (await tx.budgetEntryCategory.count({ where: scope })) > 0,
    })
  })
}

// ─── Members ────────────────────────────────────────────────────

export type BudgetMemberFields = {
  name: string
  grossMonthlyIncome: number
  taxPercent: number
}

export type UpdateBudgetMemberInput = Partial<BudgetMemberFields> & {
  expectedUpdatedAt?: Date
}

function normalizeMemberFields(input: Partial<BudgetMemberFields>) {
  return definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    grossMonthlyIncome:
      input.grossMonthlyIncome === undefined
        ? undefined
        : moneyAmount(input.grossMonthlyIncome, "Brutto månedsinntekt"),
    taxPercent:
      input.taxPercent === undefined
        ? undefined
        : percent(input.taxPercent, "Skatteprosent"),
  })
}

export async function createBudgetMember(
  context: ApplicationContext,
  input: BudgetMemberFields,
  options: BudgetWriteOptions = {}
) {
  const fields = normalizeMemberFields(input)
  const data = {
    name: required(fields.name, "Navn"),
    grossMonthlyIncome: required(
      fields.grossMonthlyIncome,
      "Brutto månedsinntekt"
    ),
    taxPercent: required(fields.taxPercent, "Skatteprosent"),
  }

  return runBudgetWrite(context, options, async (tx, budgetId) => {
    const sortOrder = await tx.budgetMember.count({ where: { budgetId } })
    return tx.budgetMember.create({ data: { ...data, budgetId, sortOrder } })
  })
}

export async function updateBudgetMember(
  context: ApplicationContext,
  memberId: string,
  input: UpdateBudgetMemberInput,
  options: BudgetWriteOptions = {}
) {
  const { expectedUpdatedAt, ...rest } = input
  const fields = normalizeMemberFields(rest)

  return runBudgetWrite(context, options, (tx, budgetId) => {
    const scope = { id: memberId, budgetId }

    return scopedWrite({
      resource: "budsjettmedlem",
      expectedUpdatedAt,
      write: () =>
        tx.budgetMember.update({
          where: { ...scope, ...freshness(expectedUpdatedAt) },
          data: fields,
        }),
      existsInScope: async () =>
        (await tx.budgetMember.count({ where: scope })) > 0,
    })
  })
}

// ─── Loans ──────────────────────────────────────────────────────

export type BudgetLoanFields = {
  bankName: string
  loanName: string
  loanType?: BudgetLoanType
  repaymentType?: BudgetLoanRepaymentType
  principalAmount: number
  /** Percent per year, e.g. 5.25. */
  annualInterestRate: number
  termMonths: number
  monthlyFees?: number
}

export type UpdateBudgetLoanInput = Partial<BudgetLoanFields> & {
  expectedUpdatedAt?: Date
}

function normalizeLoanFields(input: Partial<BudgetLoanFields>) {
  return definedFields({
    bankName:
      input.bankName === undefined
        ? undefined
        : requiredText(input.bankName, "Bank"),
    loanName:
      input.loanName === undefined
        ? undefined
        : requiredText(input.loanName, "Lånenavn"),
    loanType:
      input.loanType === undefined
        ? undefined
        : enumValue(input.loanType, LOAN_TYPES, "Lånetype"),
    repaymentType:
      input.repaymentType === undefined
        ? undefined
        : enumValue(input.repaymentType, REPAYMENT_TYPES, "Nedbetalingstype"),
    principalAmount:
      input.principalAmount === undefined
        ? undefined
        : moneyAmount(input.principalAmount, "Lånebeløp", MAX_PRINCIPAL_AMOUNT),
    annualInterestRate:
      input.annualInterestRate === undefined
        ? undefined
        : Math.round(
            numberInRange(input.annualInterestRate, "Rente", {
              min: 0,
              max: 100,
            }) * 1000
          ) / 1000,
    termMonths:
      input.termMonths === undefined
        ? undefined
        : integerInRange(input.termMonths, "Løpetid i måneder", {
            min: 1,
            max: MAX_TERM_MONTHS,
          }),
    monthlyFees:
      input.monthlyFees === undefined
        ? undefined
        : moneyAmount(input.monthlyFees, "Månedlige gebyrer"),
  })
}

export async function createBudgetLoan(
  context: ApplicationContext,
  input: BudgetLoanFields,
  options: BudgetWriteOptions = {}
) {
  const fields = normalizeLoanFields({
    loanType: "MORTGAGE",
    repaymentType: "ANNUITY",
    monthlyFees: 0,
    ...definedFields(input),
  })
  const data = {
    bankName: required(fields.bankName, "Bank"),
    loanName: required(fields.loanName, "Lånenavn"),
    loanType: required(fields.loanType, "Lånetype"),
    repaymentType: required(fields.repaymentType, "Nedbetalingstype"),
    principalAmount: required(fields.principalAmount, "Lånebeløp"),
    annualInterestRate: required(fields.annualInterestRate, "Rente"),
    termMonths: required(fields.termMonths, "Løpetid i måneder"),
    monthlyFees: required(fields.monthlyFees, "Månedlige gebyrer"),
  }

  return runBudgetWrite(context, options, async (tx, budgetId) => {
    const sortOrder = await tx.budgetLoan.count({ where: { budgetId } })
    return tx.budgetLoan.create({ data: { ...data, budgetId, sortOrder } })
  })
}

export async function updateBudgetLoan(
  context: ApplicationContext,
  loanId: string,
  input: UpdateBudgetLoanInput,
  options: BudgetWriteOptions = {}
) {
  const { expectedUpdatedAt, ...rest } = input
  const fields = normalizeLoanFields(rest)

  return runBudgetWrite(context, options, (tx, budgetId) => {
    const scope = { id: loanId, budgetId }

    return scopedWrite({
      resource: "lån",
      expectedUpdatedAt,
      write: () =>
        tx.budgetLoan.update({
          where: { ...scope, ...freshness(expectedUpdatedAt) },
          data: fields,
        }),
      existsInScope: async () =>
        (await tx.budgetLoan.count({ where: scope })) > 0,
    })
  })
}

// ─── Trips ──────────────────────────────────────────────────────

export type BudgetTripFields = {
  name: string
  transportType: TripTransportType
  annualTrips?: number
  /** Used for AIR_OR_PUBLIC trips; ignored (stored as null) for CAR. */
  ticketPerTrip?: number | null
  /** The three below are used for CAR trips; ignored for AIR_OR_PUBLIC. */
  tollPerTrip?: number | null
  ferryPerTrip?: number | null
  fuelPerTrip?: number | null
}

export type UpdateBudgetTripInput = Partial<BudgetTripFields> & {
  expectedUpdatedAt?: Date
}

type TripCosts = {
  ticketPerTrip: number | null
  tollPerTrip: number | null
  ferryPerTrip: number | null
  fuelPerTrip: number | null
}

type DecimalLike = { toNumber(): number } | null

function cost(
  value: number | null | undefined,
  existing: DecimalLike | undefined,
  field: string
) {
  if (value === undefined) return existing ? existing.toNumber() : 0
  return optionalMoneyAmount(value, field) ?? 0
}

/**
 * Only the cost fields that apply to the transport type are stored; the others
 * are null, so a trip never carries costs the calculation would ignore.
 */
function tripCosts(
  transportType: TripTransportType,
  input: Partial<BudgetTripFields>,
  existing?: Record<keyof TripCosts, DecimalLike>
): TripCosts {
  if (transportType === "AIR_OR_PUBLIC") {
    return {
      ticketPerTrip: cost(
        input.ticketPerTrip,
        existing?.ticketPerTrip,
        "Billettpris"
      ),
      tollPerTrip: null,
      ferryPerTrip: null,
      fuelPerTrip: null,
    }
  }

  return {
    ticketPerTrip: null,
    tollPerTrip: cost(input.tollPerTrip, existing?.tollPerTrip, "Bompenger"),
    ferryPerTrip: cost(input.ferryPerTrip, existing?.ferryPerTrip, "Ferje"),
    fuelPerTrip: cost(input.fuelPerTrip, existing?.fuelPerTrip, "Drivstoff"),
  }
}

function annualTrips(value: number) {
  return integerInRange(value, "Antall turer per år", {
    min: 1,
    max: MAX_ANNUAL_TRIPS,
  })
}

export async function createBudgetTrip(
  context: ApplicationContext,
  input: BudgetTripFields,
  options: BudgetWriteOptions = {}
) {
  const transportType = enumValue(
    required(input.transportType, "Transporttype"),
    TRIP_TYPES,
    "Transporttype"
  )
  const data = {
    name: requiredText(required(input.name, "Navn"), "Navn"),
    transportType,
    annualTrips: annualTrips(input.annualTrips ?? 1),
    ...tripCosts(transportType, input),
  }

  return runBudgetWrite(context, options, async (tx, budgetId) => {
    const sortOrder = await tx.budgetTrip.count({ where: { budgetId } })
    return tx.budgetTrip.create({ data: { ...data, budgetId, sortOrder } })
  })
}

export async function updateBudgetTrip(
  context: ApplicationContext,
  tripId: string,
  input: UpdateBudgetTripInput,
  options: BudgetWriteOptions = {}
) {
  const { expectedUpdatedAt, ...rest } = input
  const name =
    rest.name === undefined ? undefined : requiredText(rest.name, "Navn")
  const requestedType =
    rest.transportType === undefined
      ? undefined
      : enumValue(rest.transportType, TRIP_TYPES, "Transporttype")
  const trips =
    rest.annualTrips === undefined ? undefined : annualTrips(rest.annualTrips)

  return runBudgetWrite(context, options, async (tx, budgetId) => {
    const scope = { id: tripId, budgetId }
    // The cost fields that apply depend on the stored transport type when the
    // call does not change it, so the current row is read inside the same
    // transaction. The write below still carries the ownership boundary.
    const existing = await tx.budgetTrip.findFirst({ where: scope })
    if (!existing) throw notFound("reise")

    const transportType = requestedType ?? existing.transportType

    return scopedWrite({
      resource: "reise",
      expectedUpdatedAt,
      write: () =>
        tx.budgetTrip.update({
          where: { ...scope, ...freshness(expectedUpdatedAt) },
          data: definedFields({
            name,
            transportType,
            annualTrips: trips,
            ...tripCosts(transportType, rest, existing),
          }),
        }),
      existsInScope: async () => true,
    })
  })
}

// ─── Deletes (web only; no MCP tool) ────────────────────────────

function scopedDelete(resource: string, remove: () => Promise<unknown>) {
  return scopedWrite({ resource, write: remove })
}

export function deleteBudgetEntry(
  context: ApplicationContext,
  entryId: string
) {
  return scopedDelete("budsjettpost", () =>
    db.budgetEntry.delete({
      where: { id: entryId, budget: { householdId: context.householdId } },
    })
  )
}

/** Entries in the category become uncategorized through `onDelete: SetNull`. */
export function deleteBudgetCategory(
  context: ApplicationContext,
  categoryId: string
) {
  return scopedDelete("budsjettkategori", () =>
    db.budgetEntryCategory.delete({
      where: { id: categoryId, budget: { householdId: context.householdId } },
    })
  )
}

export function deleteBudgetMember(
  context: ApplicationContext,
  memberId: string
) {
  return scopedDelete("budsjettmedlem", () =>
    db.budgetMember.delete({
      where: { id: memberId, budget: { householdId: context.householdId } },
    })
  )
}

export function deleteBudgetLoan(context: ApplicationContext, loanId: string) {
  return scopedDelete("lån", () =>
    db.budgetLoan.delete({
      where: { id: loanId, budget: { householdId: context.householdId } },
    })
  )
}

export function deleteBudgetTrip(context: ApplicationContext, tripId: string) {
  return scopedDelete("reise", () =>
    db.budgetTrip.delete({
      where: { id: tripId, budget: { householdId: context.householdId } },
    })
  )
}
