import {
  BudgetEntryType,
  BudgetFrequency,
  BudgetLoanRepaymentType,
  BudgetLoanType,
  TripTransportType,
  db,
  type Prisma,
} from "@workspace/db"

import type { ApplicationContext } from "../context"
import { ApplicationError } from "../errors"
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  assertBatchSize,
  definedFields,
  enumValue,
  freshness,
  integerInRange,
  isUniqueConstraintError,
  moneyAmount,
  notFound,
  numberInRange,
  optionalCalendarDate,
  optionalMoneyAmount,
  optionalText,
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
const FREQUENCIES = Object.values(BudgetFrequency)
const LOAN_TYPES = Object.values(BudgetLoanType)
const REPAYMENT_TYPES = Object.values(BudgetLoanRepaymentType)
const TRIP_TYPES = Object.values(TripTransportType)

/** `Decimal(14, 2)` on `BudgetLoan.principalAmount`. */
const MAX_PRINCIPAL_AMOUNT = 999_999_999_999.99
/** `Decimal(14, 2)` on `Budget.propertyValue`. */
const MAX_PROPERTY_VALUE = 999_999_999_999.99
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

async function createDefaultBudgetCategories(
  client: BudgetDbClient,
  budgetId: string
) {
  await client.budgetEntryCategory.createMany({
    data: DEFAULT_BUDGET_CATEGORY_NAMES.map((name, index) => ({
      budgetId,
      name,
      sortOrder: index,
    })),
    // Two first writes racing each other both reach this point.
    skipDuplicates: true,
  })
}

/**
 * Creates the household's budget on first use. A household without a budget
 * reads as `hasBudget: false`; the first write creates the row implicitly,
 * with the default categories. The defaults are only added together with the
 * row, so categories the household deleted do not come back.
 */
export async function ensureBudgetRow(
  client: BudgetDbClient,
  householdId: string
) {
  const existing = await client.budget.findUnique({ where: { householdId } })
  if (existing) return existing

  const budget = await client.budget.upsert({
    where: { householdId },
    update: {},
    create: { householdId },
  })

  await createDefaultBudgetCategories(client, budget.id)

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

function notes(value: string | null | undefined) {
  return optionalText(value, "Notat", MAX_LONG_TEXT_LENGTH)
}

export type BudgetSettingsInput = {
  /** Share of loan interest that is tax deductible, 0–100. */
  taxDeductionPercent?: number
  /** Market value of the home; null clears it. */
  propertyValue?: number | null
  expectedUpdatedAt?: Date
}

export async function updateBudgetSettings(
  context: ApplicationContext,
  input: BudgetSettingsInput,
  options: BudgetWriteOptions = {}
) {
  const data = definedFields({
    taxDeductionPercent:
      input.taxDeductionPercent === undefined
        ? undefined
        : percent(input.taxDeductionPercent, "Rentefradrag"),
    propertyValue: optionalMoneyAmount(
      input.propertyValue,
      "Boligverdi",
      MAX_PROPERTY_VALUE
    ),
  })

  return runBudgetWrite(context, options, (tx, budgetId) =>
    scopedWrite({
      resource: "budsjett",
      expectedUpdatedAt: input.expectedUpdatedAt,
      write: () =>
        tx.budget.update({
          where: { id: budgetId, ...freshness(input.expectedUpdatedAt) },
          data,
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
  /** The amount per occurrence. */
  amount: number
  /** How often `amount` occurs. Defaults to MONTHLY. */
  frequency?: BudgetFrequency
  provider?: string | null
  /** Day of the month, 1–31. */
  paymentDay?: number | null
  /** `YYYY-MM-DD` or a `Date`. */
  renewalDate?: Date | string | null
  notes?: string | null
}

export type UpdateBudgetEntryInput = Partial<BudgetEntryFields> & {
  expectedUpdatedAt?: Date
}

const ENTRY_INCLUDE = { category: { select: { id: true, name: true } } }

function normalizeEntryFields(input: Partial<BudgetEntryFields>) {
  return definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    type:
      input.type === undefined
        ? undefined
        : enumValue(input.type, ENTRY_TYPES, "Type"),
    amount:
      input.amount === undefined
        ? undefined
        : moneyAmount(input.amount, "Beløp"),
    frequency:
      input.frequency === undefined
        ? undefined
        : enumValue(input.frequency, FREQUENCIES, "Frekvens"),
    provider: optionalText(input.provider, "Leverandør", MAX_NAME_LENGTH),
    paymentDay:
      input.paymentDay == null
        ? input.paymentDay
        : integerInRange(input.paymentDay, "Trekkdag", { min: 1, max: 31 }),
    renewalDate: optionalCalendarDate(input.renewalDate, "Bindingstid til"),
    notes: notes(input.notes),
  })
}

function newEntryData(input: BudgetEntryFields) {
  const fields = normalizeEntryFields(input)
  return {
    ...fields,
    name: required(fields.name, "Navn"),
    type: required(fields.type, "Type"),
    amount: required(fields.amount, "Beløp"),
  }
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
  const data = newEntryData(input)

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
      include: ENTRY_INCLUDE,
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
          include: ENTRY_INCLUDE,
        }),
      existsInScope: async () =>
        (await tx.budgetEntry.count({ where: scope })) > 0,
    })
  })
}

// ─── Several entries at once ────────────────────────────────────

export type NewBudgetEntryInput = BudgetEntryFields & {
  /**
   * Category by name instead of id: matched ignoring case, and created when
   * the budget has none by that name. Cannot be combined with `categoryId`.
   */
  categoryName?: string | null
}

export type SkippedBudgetEntry = {
  index: number
  name: string
  existingEntryId: string | null
  reason: "ALREADY_EXISTS" | "DUPLICATE_IN_REQUEST"
}

const entryNameCollator = new Intl.Collator("nb-NO", { sensitivity: "base" })

function sameName(a: string, b: string) {
  return (
    entryNameCollator.compare(
      normalizeBudgetCategoryName(a),
      normalizeBudgetCategoryName(b)
    ) === 0
  )
}

/**
 * Adds up to 100 entries in one transaction, so a first budget can be laid
 * out in one call. An entry whose name already exists in the same category,
 * ignoring case, is skipped and reported rather than added twice; the same
 * goes for a repeat within the request. Any invalid entry fails the whole
 * call and nothing is saved.
 */
export async function addBudgetEntries(
  context: ApplicationContext,
  entries: NewBudgetEntryInput[],
  options: BudgetWriteOptions = {}
) {
  assertBatchSize(entries.length, "Budsjettpostene")

  const prepared = entries.map((entry, index) => {
    try {
      if (entry.categoryId && entry.categoryName) {
        throw validationError("Bruk enten categoryId eller categoryName.")
      }
      const categoryName =
        entry.categoryName == null
          ? null
          : requiredText(
              normalizeBudgetCategoryName(entry.categoryName),
              "Kategorinavn"
            )
      return {
        data: newEntryData(entry),
        categoryId: entry.categoryId ?? null,
        categoryName,
      }
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw new ApplicationError(
          error.code,
          `Post ${index + 1}: ${error.message}`
        )
      }
      throw error
    }
  })

  return runBudgetWrite(context, options, async (tx, budgetId) => {
    const categories = await tx.budgetEntryCategory.findMany({
      where: { budgetId },
      select: { id: true, name: true, sortOrder: true },
    })
    const existing = await tx.budgetEntry.findMany({
      where: { budgetId },
      select: { id: true, name: true, categoryId: true },
    })
    let nextEntryOrder = existing.length
    let nextCategoryOrder =
      categories.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1

    const createdCategories: Array<{
      id: string
      name: string
      sortOrder: number
      updatedAt: Date
    }> = []
    const created: Prisma.BudgetEntryGetPayload<{
      include: typeof ENTRY_INCLUDE
    }>[] = []
    const skipped: SkippedBudgetEntry[] = []
    const seen: Array<{ name: string; categoryId: string | null }> = []

    for (const [index, entry] of prepared.entries()) {
      let categoryId = entry.categoryId
      if (categoryId) {
        if (!categories.some((category) => category.id === categoryId)) {
          throw new ApplicationError(
            "NOT_FOUND",
            `Post ${index + 1}: ${notFound("budsjettkategori").message}`
          )
        }
      } else if (entry.categoryName) {
        const name = entry.categoryName
        const match = categories.find((category) =>
          sameName(category.name, name)
        )
        if (match) {
          categoryId = match.id
        } else {
          const category = await writeCategory(name, () =>
            tx.budgetEntryCategory.create({
              data: { budgetId, name, sortOrder: nextCategoryOrder++ },
            })
          )
          categories.push(category)
          createdCategories.push(category)
          categoryId = category.id
        }
      }

      const matches = (row: { name: string; categoryId: string | null }) =>
        row.categoryId === categoryId && sameName(row.name, entry.data.name)

      const stored = existing.find(matches)
      if (stored) {
        skipped.push({
          index,
          name: entry.data.name,
          existingEntryId: stored.id,
          reason: "ALREADY_EXISTS",
        })
        continue
      }
      if (seen.some(matches)) {
        skipped.push({
          index,
          name: entry.data.name,
          existingEntryId: null,
          reason: "DUPLICATE_IN_REQUEST",
        })
        continue
      }
      seen.push({ name: entry.data.name, categoryId })

      created.push(
        await tx.budgetEntry.create({
          data: {
            ...entry.data,
            categoryId,
            budgetId,
            sortOrder: nextEntryOrder++,
          },
          include: ENTRY_INCLUDE,
        })
      )
    }

    return { created, skipped, createdCategories }
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
  /** Actual payout; replaces gross × (1 − tax) when set. */
  netMonthlyIncome?: number | null
  notes?: string | null
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
    netMonthlyIncome: optionalMoneyAmount(
      input.netMonthlyIncome,
      "Utbetalt netto"
    ),
    notes: notes(input.notes),
  })
}

export async function createBudgetMember(
  context: ApplicationContext,
  input: BudgetMemberFields,
  options: BudgetWriteOptions = {}
) {
  const fields = normalizeMemberFields(input)
  const data = {
    ...fields,
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
  /** `YYYY-MM-DD` or a `Date`; null clears it. */
  fixedRateUntil?: Date | string | null
  notes?: string | null
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
    fixedRateUntil: optionalCalendarDate(input.fixedRateUntil, "Fastrente til"),
    notes: notes(input.notes),
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
    ...fields,
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
  /** Parking, accommodation and so on; applies to every transport type. */
  otherPerTrip?: number | null
  notes?: string | null
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
    otherPerTrip:
      optionalMoneyAmount(input.otherPerTrip, "Andre kostnader") ?? null,
    notes: notes(input.notes) ?? null,
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
  const otherPerTrip = optionalMoneyAmount(rest.otherPerTrip, "Andre kostnader")
  const tripNotes = notes(rest.notes)

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
            otherPerTrip,
            notes: tripNotes,
          }),
        }),
      existsInScope: async () => true,
    })
  })
}

// ─── Deletes ────────────────────────────────────────────────────
//
// Shared by the web page and MCP. Like every other budget write they run in
// `runBudgetWrite`, so MCP can preview a delete with `dryRun` and both get the
// summary before and after.

export function deleteBudgetEntry(
  context: ApplicationContext,
  entryId: string,
  options: BudgetWriteOptions = {}
) {
  return runBudgetWrite(context, options, (tx, budgetId) =>
    scopedWrite({
      resource: "budsjettpost",
      write: () =>
        tx.budgetEntry.delete({
          where: { id: entryId, budgetId },
          include: ENTRY_INCLUDE,
        }),
    })
  )
}

/**
 * Entries in the category become uncategorized through `onDelete: SetNull`,
 * so the totals do not change.
 */
export function deleteBudgetCategory(
  context: ApplicationContext,
  categoryId: string,
  options: BudgetWriteOptions = {}
) {
  return runBudgetWrite(context, options, async (tx, budgetId) => {
    const entryCount = await tx.budgetEntry.count({
      where: { categoryId, budgetId },
    })
    const category = await scopedWrite({
      resource: "budsjettkategori",
      write: () =>
        tx.budgetEntryCategory.delete({ where: { id: categoryId, budgetId } }),
    })
    return { ...category, uncategorizedEntryCount: entryCount }
  })
}

export function deleteBudgetMember(
  context: ApplicationContext,
  memberId: string,
  options: BudgetWriteOptions = {}
) {
  return runBudgetWrite(context, options, (tx, budgetId) =>
    scopedWrite({
      resource: "budsjettmedlem",
      write: () =>
        tx.budgetMember.delete({ where: { id: memberId, budgetId } }),
    })
  )
}

export function deleteBudgetLoan(
  context: ApplicationContext,
  loanId: string,
  options: BudgetWriteOptions = {}
) {
  return runBudgetWrite(context, options, (tx, budgetId) =>
    scopedWrite({
      resource: "lån",
      write: () => tx.budgetLoan.delete({ where: { id: loanId, budgetId } }),
    })
  )
}

export function deleteBudgetTrip(
  context: ApplicationContext,
  tripId: string,
  options: BudgetWriteOptions = {}
) {
  return runBudgetWrite(context, options, (tx, budgetId) =>
    scopedWrite({
      resource: "reise",
      write: () => tx.budgetTrip.delete({ where: { id: tripId, budgetId } }),
    })
  )
}
