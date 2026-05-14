"use server"

import {
  db,
  Prisma,
  type BudgetEntryType,
  type BudgetLoanType,
  type TripTransportType,
} from "@workspace/db"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

const DEFAULT_BUDGET_CATEGORY_NAMES = [
  "Boligkostnader",
  "Faste kostnader",
] as const

const VALID_ENTRY_TYPES = new Set<BudgetEntryType>([
  "INCOME",
  "EXPENSE",
  "DEDUCTION",
])
const VALID_LOAN_TYPES = new Set<BudgetLoanType>(["MORTGAGE", "OTHER"])
const VALID_TRIP_TYPES = new Set<TripTransportType>(["AIR_OR_PUBLIC", "CAR"])

type DbClient = Prisma.TransactionClient | typeof db

function normalizeBudgetCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ")
}

function normalizeEntryType(type: string) {
  const value = type.toUpperCase() as BudgetEntryType
  return VALID_ENTRY_TYPES.has(value) ? value : null
}

function normalizeLoanType(type?: string) {
  const value = (type ?? "MORTGAGE").toUpperCase() as BudgetLoanType
  return VALID_LOAN_TYPES.has(value) ? value : "MORTGAGE"
}

function normalizeTripType(type: string) {
  const value = type.toUpperCase() as TripTransportType
  return VALID_TRIP_TYPES.has(value) ? value : null
}

async function getBudgetForCurrentHousehold() {
  const { membership } = await requireHousehold()

  const budget = await db.budget.findUnique({
    where: { householdId: membership.householdId },
  })

  if (!budget) throw new Error("Budget not found")

  return budget
}

async function getBudgetCategoryOrThrow(categoryId: string, budgetId: string) {
  const category = await db.budgetEntryCategory.findUnique({
    where: { id: categoryId },
  })

  if (!category || category.budgetId !== budgetId) {
    throw new Error("Category not found")
  }

  return category
}

async function findBudgetCategoryByName(
  tx: DbClient,
  budgetId: string,
  name: string
) {
  return tx.budgetEntryCategory.findFirst({
    where: {
      budgetId,
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
    orderBy: { sortOrder: "asc" },
  })
}

async function ensureDefaultBudgetCategories(tx: DbClient, budgetId: string) {
  const [categoryCount, entryCount] = await Promise.all([
    tx.budgetEntryCategory.count({ where: { budgetId } }),
    tx.budgetEntry.count({ where: { budgetId } }),
  ])

  if (categoryCount > 0 || entryCount > 0) return

  await tx.budgetEntryCategory.createMany({
    data: DEFAULT_BUDGET_CATEGORY_NAMES.map((name, index) => ({
      budgetId,
      name,
      sortOrder: index,
    })),
  })
}

async function resolveBudgetCategoryId(
  tx: DbClient,
  budgetId: string,
  categoryName?: string | null
) {
  if (!categoryName) return null

  const normalizedName = normalizeBudgetCategoryName(categoryName)
  if (!normalizedName) return null

  const existing = await findBudgetCategoryByName(tx, budgetId, normalizedName)
  if (existing) return existing.id

  const sortOrder = await tx.budgetEntryCategory.count({
    where: { budgetId },
  })

  const created = await tx.budgetEntryCategory.create({
    data: {
      budgetId,
      name: normalizedName,
      sortOrder,
    },
  })

  return created.id
}

function revalidateBudgetPage() {
  revalidatePath("/budsjett")
}

// ─── Budget ─────────────────────────────────────────────────────

export async function ensureBudget() {
  const { membership } = await requireHousehold()

  const budget = await db.budget.upsert({
    where: { householdId: membership.householdId },
    update: {},
    create: { householdId: membership.householdId },
  })

  await ensureDefaultBudgetCategories(db, budget.id)

  return budget
}

export async function updateTaxDeductionPercent(percent: number) {
  const budget = await getBudgetForCurrentHousehold()

  await db.budget.update({
    where: { id: budget.id },
    data: { taxDeductionPercent: percent },
  })

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
  const budget = await getBudgetForCurrentHousehold()

  if (input.id) {
    const member = await db.budgetMember.findUnique({
      where: { id: input.id },
    })
    if (!member || member.budgetId !== budget.id) {
      throw new Error("Member not found")
    }

    await db.budgetMember.update({
      where: { id: input.id },
      data: {
        name: input.name,
        grossMonthlyIncome: input.grossMonthlyIncome,
        taxPercent: input.taxPercent,
      },
    })
  } else {
    const sortOrder = await db.budgetMember.count({
      where: { budgetId: budget.id },
    })

    await db.budgetMember.create({
      data: {
        budgetId: budget.id,
        name: input.name,
        grossMonthlyIncome: input.grossMonthlyIncome,
        taxPercent: input.taxPercent,
        sortOrder,
      },
    })
  }

  revalidateBudgetPage()
}

export async function deleteBudgetMember(memberId: string) {
  const budget = await getBudgetForCurrentHousehold()

  const member = await db.budgetMember.findUnique({
    where: { id: memberId },
  })
  if (!member || member.budgetId !== budget.id) {
    throw new Error("Member not found")
  }

  await db.budgetMember.delete({ where: { id: memberId } })

  revalidateBudgetPage()
}

// ─── Budget Loans ───────────────────────────────────────────────

interface UpsertBudgetLoanInput {
  id?: string
  bankName: string
  loanName: string
  loanType: BudgetLoanType
  monthlyInterest: number
  monthlyPrincipal: number
  monthlyFees: number
}

export async function upsertBudgetLoan(input: UpsertBudgetLoanInput) {
  const budget = await getBudgetForCurrentHousehold()

  if (input.id) {
    const loan = await db.budgetLoan.findUnique({ where: { id: input.id } })
    if (!loan || loan.budgetId !== budget.id) throw new Error("Loan not found")

    await db.budgetLoan.update({
      where: { id: input.id },
      data: {
        bankName: input.bankName,
        loanName: input.loanName,
        loanType: input.loanType,
        monthlyInterest: input.monthlyInterest,
        monthlyPrincipal: input.monthlyPrincipal,
        monthlyFees: input.monthlyFees,
      },
    })
  } else {
    const sortOrder = await db.budgetLoan.count({
      where: { budgetId: budget.id },
    })

    await db.budgetLoan.create({
      data: {
        budgetId: budget.id,
        bankName: input.bankName,
        loanName: input.loanName,
        loanType: input.loanType,
        monthlyInterest: input.monthlyInterest,
        monthlyPrincipal: input.monthlyPrincipal,
        monthlyFees: input.monthlyFees,
        sortOrder,
      },
    })
  }

  revalidateBudgetPage()
}

export async function deleteBudgetLoan(loanId: string) {
  const budget = await getBudgetForCurrentHousehold()

  const loan = await db.budgetLoan.findUnique({ where: { id: loanId } })
  if (!loan || loan.budgetId !== budget.id) throw new Error("Loan not found")

  await db.budgetLoan.delete({ where: { id: loanId } })

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
  const budget = await getBudgetForCurrentHousehold()

  const baseData = {
    name: input.name,
    transportType: input.transportType,
    annualTrips: input.annualTrips,
    ticketPerTrip:
      input.transportType === "AIR_OR_PUBLIC"
        ? (input.ticketPerTrip ?? 0)
        : null,
    tollPerTrip:
      input.transportType === "CAR" ? (input.tollPerTrip ?? 0) : null,
    ferryPerTrip:
      input.transportType === "CAR" ? (input.ferryPerTrip ?? 0) : null,
    fuelPerTrip:
      input.transportType === "CAR" ? (input.fuelPerTrip ?? 0) : null,
  }

  if (input.id) {
    const trip = await db.budgetTrip.findUnique({ where: { id: input.id } })
    if (!trip || trip.budgetId !== budget.id) throw new Error("Trip not found")

    await db.budgetTrip.update({
      where: { id: input.id },
      data: baseData,
    })
  } else {
    const sortOrder = await db.budgetTrip.count({
      where: { budgetId: budget.id },
    })

    await db.budgetTrip.create({
      data: {
        budgetId: budget.id,
        ...baseData,
        sortOrder,
      },
    })
  }

  revalidateBudgetPage()
}

export async function deleteBudgetTrip(tripId: string) {
  const budget = await getBudgetForCurrentHousehold()

  const trip = await db.budgetTrip.findUnique({ where: { id: tripId } })
  if (!trip || trip.budgetId !== budget.id) throw new Error("Trip not found")

  await db.budgetTrip.delete({ where: { id: tripId } })

  revalidateBudgetPage()
}

// ─── Budget Categories ───────────────────────────────────────────

interface UpsertBudgetCategoryInput {
  id?: string
  name: string
}

export async function upsertBudgetCategory(input: UpsertBudgetCategoryInput) {
  const budget = await getBudgetForCurrentHousehold()
  const name = normalizeBudgetCategoryName(input.name)

  if (!name) throw new Error("Category name is required")

  const duplicate = await findBudgetCategoryByName(db, budget.id, name)
  if (duplicate && duplicate.id !== input.id) {
    throw new Error("Category already exists")
  }

  if (input.id) {
    const category = await getBudgetCategoryOrThrow(input.id, budget.id)

    await db.budgetEntryCategory.update({
      where: { id: category.id },
      data: { name },
    })
  } else {
    const sortOrder = await db.budgetEntryCategory.count({
      where: { budgetId: budget.id },
    })

    await db.budgetEntryCategory.create({
      data: {
        budgetId: budget.id,
        name,
        sortOrder,
      },
    })
  }

  revalidateBudgetPage()
}

export async function deleteBudgetCategory(categoryId: string) {
  const budget = await getBudgetForCurrentHousehold()
  const category = await getBudgetCategoryOrThrow(categoryId, budget.id)

  await db.$transaction(async (tx) => {
    await tx.budgetEntry.updateMany({
      where: {
        budgetId: budget.id,
        categoryId: category.id,
      },
      data: { categoryId: null },
    })

    await tx.budgetEntryCategory.delete({
      where: { id: category.id },
    })
  })

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
  const budget = await getBudgetForCurrentHousehold()

  if (input.categoryId) {
    await getBudgetCategoryOrThrow(input.categoryId, budget.id)
  }

  if (input.id) {
    const entry = await db.budgetEntry.findUnique({ where: { id: input.id } })
    if (!entry || entry.budgetId !== budget.id) {
      throw new Error("Entry not found")
    }

    await db.budgetEntry.update({
      where: { id: input.id },
      data: {
        name: input.name,
        categoryId: input.categoryId ?? null,
        type: input.type,
        monthlyAmount: input.monthlyAmount,
      },
    })
  } else {
    const sortOrder = await db.budgetEntry.count({
      where: { budgetId: budget.id },
    })

    await db.budgetEntry.create({
      data: {
        budgetId: budget.id,
        name: input.name,
        categoryId: input.categoryId ?? null,
        type: input.type,
        monthlyAmount: input.monthlyAmount,
        sortOrder,
      },
    })
  }

  revalidateBudgetPage()
}

export async function deleteBudgetEntry(entryId: string) {
  const budget = await getBudgetForCurrentHousehold()

  const entry = await db.budgetEntry.findUnique({ where: { id: entryId } })
  if (!entry || entry.budgetId !== budget.id) throw new Error("Entry not found")

  await db.budgetEntry.delete({ where: { id: entryId } })

  revalidateBudgetPage()
}

// ─── Bulk Import ────────────────────────────────────────────────

interface BulkBudgetMemberInput {
  name: string
  grossMonthlyIncome: number
  taxPercent: number
}

interface BulkBudgetLoanInput {
  bankName: string
  loanName: string
  loanType?: string
  monthlyInterest: number
  monthlyPrincipal: number
  monthlyFees?: number
}

interface BulkBudgetTripInput {
  name: string
  transportType: string
  annualTrips: number
  ticketPerTrip?: number
  tollPerTrip?: number
  ferryPerTrip?: number
  fuelPerTrip?: number
}

interface BulkBudgetEntryInput {
  name: string
  category?: string
  type: string
  monthlyAmount: number
}

interface BulkBudgetImportInput {
  members?: BulkBudgetMemberInput[]
  loans?: BulkBudgetLoanInput[]
  trips?: BulkBudgetTripInput[]
  entries?: BulkBudgetEntryInput[]
}

export async function bulkImportBudget(input: BulkBudgetImportInput) {
  const budget = await getBudgetForCurrentHousehold()
  let count = 0

  await db.$transaction(async (tx) => {
    if (input.members && input.members.length > 0) {
      let sortOrder = await tx.budgetMember.count({
        where: { budgetId: budget.id },
      })

      for (const member of input.members) {
        await tx.budgetMember.create({
          data: {
            budgetId: budget.id,
            name: member.name,
            grossMonthlyIncome: member.grossMonthlyIncome,
            taxPercent: member.taxPercent,
            sortOrder,
          },
        })
        sortOrder += 1
      }

      count += input.members.length
    }

    if (input.loans && input.loans.length > 0) {
      let sortOrder = await tx.budgetLoan.count({
        where: { budgetId: budget.id },
      })

      for (const loan of input.loans) {
        await tx.budgetLoan.create({
          data: {
            budgetId: budget.id,
            bankName: loan.bankName,
            loanName: loan.loanName,
            loanType: normalizeLoanType(loan.loanType),
            monthlyInterest: loan.monthlyInterest,
            monthlyPrincipal: loan.monthlyPrincipal,
            monthlyFees: loan.monthlyFees ?? 0,
            sortOrder,
          },
        })
        sortOrder += 1
      }

      count += input.loans.length
    }

    if (input.trips && input.trips.length > 0) {
      let sortOrder = await tx.budgetTrip.count({
        where: { budgetId: budget.id },
      })

      for (const trip of input.trips) {
        const tripType = normalizeTripType(trip.transportType)
        if (!tripType) continue

        await tx.budgetTrip.create({
          data: {
            budgetId: budget.id,
            name: trip.name,
            transportType: tripType,
            annualTrips: Math.max(1, Math.round(trip.annualTrips || 1)),
            ticketPerTrip:
              tripType === "AIR_OR_PUBLIC" ? (trip.ticketPerTrip ?? 0) : null,
            tollPerTrip: tripType === "CAR" ? (trip.tollPerTrip ?? 0) : null,
            ferryPerTrip: tripType === "CAR" ? (trip.ferryPerTrip ?? 0) : null,
            fuelPerTrip: tripType === "CAR" ? (trip.fuelPerTrip ?? 0) : null,
            sortOrder,
          },
        })
        sortOrder += 1
        count += 1
      }
    }

    if (input.entries && input.entries.length > 0) {
      let sortOrder = await tx.budgetEntry.count({
        where: { budgetId: budget.id },
      })

      for (const entry of input.entries) {
        const entryType = normalizeEntryType(entry.type)
        if (!entryType) continue

        await tx.budgetEntry.create({
          data: {
            budgetId: budget.id,
            name: entry.name,
            categoryId: await resolveBudgetCategoryId(
              tx,
              budget.id,
              entry.category
            ),
            type: entryType,
            monthlyAmount: entry.monthlyAmount,
            sortOrder,
          },
        })
        sortOrder += 1
        count += 1
      }
    }
  })

  revalidateBudgetPage()
  return { count }
}

export async function replaceBudget(input: BulkBudgetImportInput) {
  const budget = await getBudgetForCurrentHousehold()
  let count = 0

  await db.$transaction(async (tx) => {
    await tx.budgetMember.deleteMany({ where: { budgetId: budget.id } })
    await tx.budgetLoan.deleteMany({ where: { budgetId: budget.id } })
    await tx.budgetTrip.deleteMany({ where: { budgetId: budget.id } })
    await tx.budgetEntry.deleteMany({ where: { budgetId: budget.id } })
    await tx.budgetEntryCategory.deleteMany({ where: { budgetId: budget.id } })

    if (input.members && input.members.length > 0) {
      for (const [sortOrder, member] of input.members.entries()) {
        await tx.budgetMember.create({
          data: {
            budgetId: budget.id,
            name: member.name,
            grossMonthlyIncome: member.grossMonthlyIncome,
            taxPercent: member.taxPercent,
            sortOrder,
          },
        })
      }

      count += input.members.length
    }

    if (input.loans && input.loans.length > 0) {
      for (const [sortOrder, loan] of input.loans.entries()) {
        await tx.budgetLoan.create({
          data: {
            budgetId: budget.id,
            bankName: loan.bankName,
            loanName: loan.loanName,
            loanType: normalizeLoanType(loan.loanType),
            monthlyInterest: loan.monthlyInterest,
            monthlyPrincipal: loan.monthlyPrincipal,
            monthlyFees: loan.monthlyFees ?? 0,
            sortOrder,
          },
        })
      }

      count += input.loans.length
    }

    if (input.trips && input.trips.length > 0) {
      let sortOrder = 0

      for (const trip of input.trips) {
        const tripType = normalizeTripType(trip.transportType)
        if (!tripType) continue

        await tx.budgetTrip.create({
          data: {
            budgetId: budget.id,
            name: trip.name,
            transportType: tripType,
            annualTrips: Math.max(1, Math.round(trip.annualTrips || 1)),
            ticketPerTrip:
              tripType === "AIR_OR_PUBLIC" ? (trip.ticketPerTrip ?? 0) : null,
            tollPerTrip: tripType === "CAR" ? (trip.tollPerTrip ?? 0) : null,
            ferryPerTrip: tripType === "CAR" ? (trip.ferryPerTrip ?? 0) : null,
            fuelPerTrip: tripType === "CAR" ? (trip.fuelPerTrip ?? 0) : null,
            sortOrder,
          },
        })
        sortOrder += 1
        count += 1
      }
    }

    if (input.entries && input.entries.length > 0) {
      let sortOrder = 0

      for (const entry of input.entries) {
        const entryType = normalizeEntryType(entry.type)
        if (!entryType) continue

        await tx.budgetEntry.create({
          data: {
            budgetId: budget.id,
            name: entry.name,
            categoryId: await resolveBudgetCategoryId(
              tx,
              budget.id,
              entry.category
            ),
            type: entryType,
            monthlyAmount: entry.monthlyAmount,
            sortOrder,
          },
        })
        sortOrder += 1
        count += 1
      }
    }

    await ensureDefaultBudgetCategories(tx, budget.id)
  })

  revalidateBudgetPage()
  return { count }
}

// ─── Duplicate Detection ────────────────────────────────────────

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
  monthlyInterest: number
  monthlyPrincipal: number
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

export async function findExistingBudgetItems(): Promise<ExistingBudgetItems> {
  const { membership } = await requireHousehold()

  const budget = await db.budget.findUnique({
    where: { householdId: membership.householdId },
    include: {
      members: true,
      loans: true,
      trips: true,
      entries: {
        include: {
          category: true,
        },
      },
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
      monthlyInterest: Number(loan.monthlyInterest),
      monthlyPrincipal: Number(loan.monthlyPrincipal),
      monthlyFees: Number(loan.monthlyFees),
    })),
    trips: budget.trips.map((trip) => ({
      id: trip.id,
      name: trip.name,
      transportType: trip.transportType,
      annualTrips: trip.annualTrips,
      ticketPerTrip: trip.ticketPerTrip ? Number(trip.ticketPerTrip) : null,
      tollPerTrip: trip.tollPerTrip ? Number(trip.tollPerTrip) : null,
      ferryPerTrip: trip.ferryPerTrip ? Number(trip.ferryPerTrip) : null,
      fuelPerTrip: trip.fuelPerTrip ? Number(trip.fuelPerTrip) : null,
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

// ─── Bulk Import With Duplicate Handling ────────────────────────

interface BudgetMemberFieldUpdate {
  id: string
  fields: {
    grossMonthlyIncome?: number
    taxPercent?: number
  }
}

interface BudgetLoanFieldUpdate {
  id: string
  fields: {
    bankName?: string
    loanType?: string
    monthlyInterest?: number
    monthlyPrincipal?: number
    monthlyFees?: number
  }
}

interface BudgetTripFieldUpdate {
  id: string
  fields: {
    transportType?: string
    annualTrips?: number
    ticketPerTrip?: number | null
    tollPerTrip?: number | null
    ferryPerTrip?: number | null
    fuelPerTrip?: number | null
  }
}

interface BudgetEntryFieldUpdate {
  id: string
  fields: {
    category?: string | null
    monthlyAmount?: number
  }
}

interface BulkBudgetImportWithDuplicatesInput {
  newMembers?: BulkBudgetMemberInput[]
  memberUpdates?: BudgetMemberFieldUpdate[]
  newLoans?: BulkBudgetLoanInput[]
  loanUpdates?: BudgetLoanFieldUpdate[]
  newTrips?: BulkBudgetTripInput[]
  tripUpdates?: BudgetTripFieldUpdate[]
  newEntries?: BulkBudgetEntryInput[]
  entryUpdates?: BudgetEntryFieldUpdate[]
}

export async function bulkImportBudgetWithDuplicates(
  input: BulkBudgetImportWithDuplicatesInput
) {
  const budget = await getBudgetForCurrentHousehold()
  let count = 0

  await db.$transaction(async (tx) => {
    if (input.newMembers && input.newMembers.length > 0) {
      let sortOrder = await tx.budgetMember.count({
        where: { budgetId: budget.id },
      })

      for (const member of input.newMembers) {
        await tx.budgetMember.create({
          data: {
            budgetId: budget.id,
            name: member.name,
            grossMonthlyIncome: member.grossMonthlyIncome,
            taxPercent: member.taxPercent,
            sortOrder,
          },
        })
        sortOrder += 1
      }

      count += input.newMembers.length
    }

    if (input.memberUpdates && input.memberUpdates.length > 0) {
      for (const update of input.memberUpdates) {
        const data: {
          grossMonthlyIncome?: number
          taxPercent?: number
        } = {}

        if (update.fields.grossMonthlyIncome !== undefined) {
          data.grossMonthlyIncome = update.fields.grossMonthlyIncome
        }
        if (update.fields.taxPercent !== undefined) {
          data.taxPercent = update.fields.taxPercent
        }

        await tx.budgetMember.update({ where: { id: update.id }, data })
      }

      count += input.memberUpdates.length
    }

    if (input.newLoans && input.newLoans.length > 0) {
      let sortOrder = await tx.budgetLoan.count({
        where: { budgetId: budget.id },
      })

      for (const loan of input.newLoans) {
        await tx.budgetLoan.create({
          data: {
            budgetId: budget.id,
            bankName: loan.bankName,
            loanName: loan.loanName,
            loanType: normalizeLoanType(loan.loanType),
            monthlyInterest: loan.monthlyInterest,
            monthlyPrincipal: loan.monthlyPrincipal,
            monthlyFees: loan.monthlyFees ?? 0,
            sortOrder,
          },
        })
        sortOrder += 1
      }

      count += input.newLoans.length
    }

    if (input.loanUpdates && input.loanUpdates.length > 0) {
      for (const update of input.loanUpdates) {
        const data: {
          bankName?: string
          loanType?: BudgetLoanType
          monthlyInterest?: number
          monthlyPrincipal?: number
          monthlyFees?: number
        } = {}

        if (update.fields.bankName !== undefined) {
          data.bankName = update.fields.bankName
        }
        if (update.fields.loanType !== undefined) {
          data.loanType = normalizeLoanType(update.fields.loanType)
        }
        if (update.fields.monthlyInterest !== undefined) {
          data.monthlyInterest = update.fields.monthlyInterest
        }
        if (update.fields.monthlyPrincipal !== undefined) {
          data.monthlyPrincipal = update.fields.monthlyPrincipal
        }
        if (update.fields.monthlyFees !== undefined) {
          data.monthlyFees = update.fields.monthlyFees
        }

        await tx.budgetLoan.update({ where: { id: update.id }, data })
      }

      count += input.loanUpdates.length
    }

    if (input.newTrips && input.newTrips.length > 0) {
      let sortOrder = await tx.budgetTrip.count({
        where: { budgetId: budget.id },
      })

      for (const trip of input.newTrips) {
        const tripType = normalizeTripType(trip.transportType)
        if (!tripType) continue

        await tx.budgetTrip.create({
          data: {
            budgetId: budget.id,
            name: trip.name,
            transportType: tripType,
            annualTrips: Math.max(1, Math.round(trip.annualTrips || 1)),
            ticketPerTrip:
              tripType === "AIR_OR_PUBLIC" ? (trip.ticketPerTrip ?? 0) : null,
            tollPerTrip: tripType === "CAR" ? (trip.tollPerTrip ?? 0) : null,
            ferryPerTrip: tripType === "CAR" ? (trip.ferryPerTrip ?? 0) : null,
            fuelPerTrip: tripType === "CAR" ? (trip.fuelPerTrip ?? 0) : null,
            sortOrder,
          },
        })
        sortOrder += 1
        count += 1
      }
    }

    if (input.tripUpdates && input.tripUpdates.length > 0) {
      for (const update of input.tripUpdates) {
        const data: {
          transportType?: TripTransportType
          annualTrips?: number
          ticketPerTrip?: number | null
          tollPerTrip?: number | null
          ferryPerTrip?: number | null
          fuelPerTrip?: number | null
        } = {}

        if (update.fields.transportType !== undefined) {
          const tripType = normalizeTripType(update.fields.transportType)
          if (tripType) data.transportType = tripType
        }
        if (update.fields.annualTrips !== undefined) {
          data.annualTrips = Math.max(1, Math.round(update.fields.annualTrips))
        }
        if (update.fields.ticketPerTrip !== undefined) {
          data.ticketPerTrip = update.fields.ticketPerTrip
        }
        if (update.fields.tollPerTrip !== undefined) {
          data.tollPerTrip = update.fields.tollPerTrip
        }
        if (update.fields.ferryPerTrip !== undefined) {
          data.ferryPerTrip = update.fields.ferryPerTrip
        }
        if (update.fields.fuelPerTrip !== undefined) {
          data.fuelPerTrip = update.fields.fuelPerTrip
        }

        await tx.budgetTrip.update({ where: { id: update.id }, data })
      }

      count += input.tripUpdates.length
    }

    if (input.newEntries && input.newEntries.length > 0) {
      let sortOrder = await tx.budgetEntry.count({
        where: { budgetId: budget.id },
      })

      for (const entry of input.newEntries) {
        const entryType = normalizeEntryType(entry.type)
        if (!entryType) continue

        await tx.budgetEntry.create({
          data: {
            budgetId: budget.id,
            name: entry.name,
            categoryId: await resolveBudgetCategoryId(
              tx,
              budget.id,
              entry.category
            ),
            type: entryType,
            monthlyAmount: entry.monthlyAmount,
            sortOrder,
          },
        })
        sortOrder += 1
        count += 1
      }
    }

    if (input.entryUpdates && input.entryUpdates.length > 0) {
      for (const update of input.entryUpdates) {
        const data: {
          categoryId?: string | null
          monthlyAmount?: number
        } = {}

        if (update.fields.category !== undefined) {
          data.categoryId = await resolveBudgetCategoryId(
            tx,
            budget.id,
            update.fields.category
          )
        }
        if (update.fields.monthlyAmount !== undefined) {
          data.monthlyAmount = update.fields.monthlyAmount
        }

        await tx.budgetEntry.update({ where: { id: update.id }, data })
      }

      count += input.entryUpdates.length
    }
  })

  revalidateBudgetPage()
  return { count }
}
