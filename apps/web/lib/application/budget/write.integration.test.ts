import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"
import { z } from "zod"

import { createToolRegistry } from "../../mcp/tools"
import { createHouseholdFixtures } from "../../test/household-fixtures"
import type { ApplicationContext } from "../context"
import { calculateBudgetStats } from "./calculations"
import { bulkImportBudget, bulkImportBudgetWithDuplicates } from "./import"
import { getBudget } from "./read"
import {
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
  setTaxDeductionPercent,
  updateBudgetCategory,
  updateBudgetEntry,
  updateBudgetLoan,
  updateBudgetMember,
  updateBudgetTrip,
} from "./write"

const fixtures = createHouseholdFixtures()

afterAll(async () => {
  await fixtures.cleanup()
  await db.$disconnect()
})

function tool(name: string) {
  const found = createToolRegistry().find((entry) => entry.name === name)
  if (!found) throw new Error(`Unknown tool ${name}`)
  return found
}

/** One of each budget row, so every id-taking service has a target. */
async function seedBudget(context: ApplicationContext) {
  const member = await createBudgetMember(context, {
    name: "Kari",
    grossMonthlyIncome: 60000,
    taxPercent: 34,
  })
  const loan = await createBudgetLoan(context, {
    bankName: "Bank",
    loanName: "Boliglån",
    principalAmount: 3_000_000,
    annualInterestRate: 5.25,
    termMonths: 300,
  })
  const trip = await createBudgetTrip(context, {
    name: "Hytta",
    transportType: "CAR",
    annualTrips: 6,
    tollPerTrip: 120,
    fuelPerTrip: 500,
  })
  const category = await createBudgetCategory(context, { name: "Bolig" })
  const entry = await createBudgetEntry(context, {
    name: "Strøm",
    type: "EXPENSE",
    monthlyAmount: 1500,
    categoryId: category.resource.id,
  })

  return {
    member: member.resource,
    loan: loan.resource,
    trip: trip.resource,
    category: category.resource,
    entry: entry.resource,
  }
}

async function freshSummary(context: ApplicationContext) {
  return calculateBudgetStats(await getBudget(context))
}

describe("budget row creation", () => {
  it("creates the budget and default categories on the first write", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    expect(await db.budget.count({ where: { householdId } })).toBe(0)

    const result = await createBudgetMember(context, {
      name: "Ola",
      grossMonthlyIncome: 50000,
      taxPercent: 30,
    })

    expect(result.summaryBefore.hasBudget).toBe(false)
    expect(result.summaryAfter.hasBudget).toBe(true)
    const budget = await db.budget.findUniqueOrThrow({
      where: { householdId },
      include: { categories: true },
    })
    expect(budget.categories.map((category) => category.name).sort()).toEqual([
      "Boligkostnader",
      "Faste kostnader",
    ])
  })

  it("does not leave a budget behind when the first write fails", async () => {
    const { context, householdId } = await fixtures.createHousehold()

    await expect(
      updateBudgetMember(context, crypto.randomUUID(), { name: "X" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(await db.budget.count({ where: { householdId } })).toBe(0)
  })
})

describe("household boundary", () => {
  it("every id-taking service answers NOT_FOUND for another household's rows and changes nothing", async () => {
    const owner = await fixtures.createHousehold()
    const intruder = await fixtures.createHousehold()
    const rows = await seedBudget(owner.context)
    const ctx = intruder.context

    const attempts = [
      () => updateBudgetEntry(ctx, rows.entry.id, { name: "Endret" }),
      () => updateBudgetCategory(ctx, rows.category.id, { name: "Endret" }),
      () => updateBudgetMember(ctx, rows.member.id, { taxPercent: 1 }),
      () => updateBudgetLoan(ctx, rows.loan.id, { annualInterestRate: 1 }),
      () => updateBudgetTrip(ctx, rows.trip.id, { annualTrips: 99 }),
      () => deleteBudgetEntry(ctx, rows.entry.id),
      () => deleteBudgetCategory(ctx, rows.category.id),
      () => deleteBudgetMember(ctx, rows.member.id),
      () => deleteBudgetLoan(ctx, rows.loan.id),
      () => deleteBudgetTrip(ctx, rows.trip.id),
    ]

    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({ code: "NOT_FOUND" })
    }

    const after = await db.budget.findUniqueOrThrow({
      where: { householdId: owner.householdId },
      include: {
        entries: true,
        categories: true,
        members: true,
        loans: true,
        trips: true,
      },
    })
    expect(after.entries[0]?.name).toBe("Strøm")
    expect(after.categories.some((c) => c.name === "Bolig")).toBe(true)
    expect(Number(after.members[0]?.taxPercent)).toBe(34)
    expect(Number(after.loans[0]?.annualInterestRate)).toBe(5.25)
    expect(after.trips[0]?.annualTrips).toBe(6)
  })

  it("rejects an entry whose category belongs to another budget", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const foreign = await createBudgetCategory(other.context, {
      name: "Fremmed",
    })
    const rows = await seedBudget(owner.context)

    await expect(
      createBudgetEntry(owner.context, {
        name: "Lekk",
        type: "EXPENSE",
        monthlyAmount: 1,
        categoryId: foreign.resource.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      updateBudgetEntry(owner.context, rows.entry.id, {
        categoryId: foreign.resource.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    const entry = await db.budgetEntry.findUniqueOrThrow({
      where: { id: rows.entry.id },
    })
    expect(entry.categoryId).toBe(rows.category.id)
  })

  it("closes the duplicate-import hole: foreign ids fail the whole import", async () => {
    const owner = await fixtures.createHousehold()
    const intruder = await fixtures.createHousehold()
    const rows = await seedBudget(owner.context)

    const attempts = [
      { memberUpdates: [{ id: rows.member.id, fields: { taxPercent: 0 } }] },
      { loanUpdates: [{ id: rows.loan.id, fields: { principalAmount: 1 } }] },
      { tripUpdates: [{ id: rows.trip.id, fields: { annualTrips: 1 } }] },
      { entryUpdates: [{ id: rows.entry.id, fields: { monthlyAmount: 0 } }] },
    ]

    for (const attempt of attempts) {
      await expect(
        bulkImportBudgetWithDuplicates(intruder.context, {
          // A legitimate row in the same call must be rolled back too.
          newMembers: [{ name: "Ny", grossMonthlyIncome: 1, taxPercent: 1 }],
          ...attempt,
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
    }

    expect(
      await db.budgetMember.count({
        where: { budget: { householdId: intruder.householdId } },
      })
    ).toBe(0)
    const [member, loan, trip, entry] = await Promise.all([
      db.budgetMember.findUniqueOrThrow({ where: { id: rows.member.id } }),
      db.budgetLoan.findUniqueOrThrow({ where: { id: rows.loan.id } }),
      db.budgetTrip.findUniqueOrThrow({ where: { id: rows.trip.id } }),
      db.budgetEntry.findUniqueOrThrow({ where: { id: rows.entry.id } }),
    ])
    expect(Number(member.taxPercent)).toBe(34)
    expect(Number(loan.principalAmount)).toBe(3_000_000)
    expect(trip.annualTrips).toBe(6)
    expect(Number(entry.monthlyAmount)).toBe(1500)
  })

  it("still applies duplicate-import updates to the caller's own rows", async () => {
    const { context } = await fixtures.createHousehold()
    const rows = await seedBudget(context)

    const result = await bulkImportBudgetWithDuplicates(context, {
      memberUpdates: [{ id: rows.member.id, fields: { taxPercent: 30 } }],
      entryUpdates: [
        { id: rows.entry.id, fields: { category: "Ny kategori" } },
      ],
    })

    expect(result.count).toBe(2)
    const entry = await db.budgetEntry.findUniqueOrThrow({
      where: { id: rows.entry.id },
      include: { category: true },
    })
    expect(entry.category?.name).toBe("Ny kategori")
  })
})

describe("dry run", () => {
  it("reports the summary after the change but stores nothing", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    await seedBudget(context)
    const before = await freshSummary(context)

    const result = await createBudgetEntry(
      context,
      { name: "Bil", type: "EXPENSE", monthlyAmount: 2500 },
      { dryRun: true }
    )

    expect(result.dryRun).toBe(true)
    expect(result.summaryBefore).toEqual(before)
    if (!result.summaryAfter.hasBudget || !before.hasBudget) {
      throw new Error("expected a budget")
    }
    expect(result.summaryAfter.disposable).toBeCloseTo(
      before.disposable - 2500,
      6
    )
    expect(
      await db.budgetEntry.count({
        where: { budget: { householdId }, name: "Bil" },
      })
    ).toBe(0)
    expect(await freshSummary(context)).toEqual(before)
  })

  it("does not create the budget row on a dry run", async () => {
    const { context, householdId } = await fixtures.createHousehold()

    await setTaxDeductionPercent(context, { percent: 22 }, { dryRun: true })

    expect(await db.budget.count({ where: { householdId } })).toBe(0)
  })

  it("a real write's summaryAfter equals a fresh read", async () => {
    const { context } = await fixtures.createHousehold()
    const rows = await seedBudget(context)

    const result = await updateBudgetLoan(context, rows.loan.id, {
      annualInterestRate: 4.1,
    })

    expect(result.dryRun).toBe(false)
    expect(result.summaryAfter).toEqual(await freshSummary(context))
  })
})

describe("validation and concurrency", () => {
  it("rejects a stale expectedUpdatedAt with CONFLICT", async () => {
    const { context } = await fixtures.createHousehold()
    const rows = await seedBudget(context)
    await updateBudgetMember(context, rows.member.id, { taxPercent: 33 })

    await expect(
      updateBudgetMember(context, rows.member.id, {
        taxPercent: 32,
        expectedUpdatedAt: rows.member.updatedAt,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("rejects a case-insensitive duplicate category name with CONFLICT", async () => {
    const { context } = await fixtures.createHousehold()
    const rows = await seedBudget(context)

    await expect(
      createBudgetCategory(context, { name: "  bolig " })
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(
      updateBudgetCategory(context, rows.category.id, {
        name: "FASTE KOSTNADER",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("rejects unknown enum values and out-of-range numbers", async () => {
    const { context } = await fixtures.createHousehold()

    await expect(
      createBudgetEntry(context, {
        name: "X",
        type: "GIFT" as never,
        monthlyAmount: 1,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(
      createBudgetMember(context, {
        name: "X",
        grossMonthlyIncome: 1,
        taxPercent: 101,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(
      createBudgetLoan(context, {
        bankName: "B",
        loanName: "L",
        principalAmount: 1,
        annualInterestRate: 1,
        termMonths: 601,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("clears costs that no longer apply when a trip changes transport type", async () => {
    const { context } = await fixtures.createHousehold()
    const rows = await seedBudget(context)

    const result = await updateBudgetTrip(context, rows.trip.id, {
      transportType: "AIR_OR_PUBLIC",
      ticketPerTrip: 900,
    })

    expect(result.resource).toMatchObject({
      tollPerTrip: null,
      ferryPerTrip: null,
      fuelPerTrip: null,
    })
    expect(Number(result.resource.ticketPerTrip)).toBe(900)
  })

  it("rejects an import above the batch limit", async () => {
    const { context } = await fixtures.createHousehold()

    await expect(
      bulkImportBudget(context, {
        entries: Array.from({ length: 101 }, (_, index) => ({
          name: `Post ${index}`,
          type: "EXPENSE",
          monthlyAmount: 1,
        })),
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })
})

describe("budget write tools", () => {
  it("create-budget-entry with dryRun previews, matches its schema and is audited", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    await seedBudget(context)
    const session = fixtures.session(context, ["budget:write"])
    const createTool = tool("create-budget-entry")

    const result = await createTool.invoke(
      { name: "Forsikring", type: "EXPENSE", monthlyAmount: 800, dryRun: true },
      session
    )

    expect(result.isError).toBeUndefined()
    const parsed = z
      .object(createTool.outputSchema)
      .parse(result.structuredContent)
    expect(parsed).toMatchObject({
      dryRun: true,
      entry: { name: "Forsikring", monthlyAmount: "800" },
    })
    expect(
      await db.budgetEntry.count({
        where: { budget: { householdId }, name: "Forsikring" },
      })
    ).toBe(0)

    const audit = await db.mcpAuditEvent.findFirstOrThrow({
      where: { correlationId: session.correlationId },
    })
    expect(audit).toMatchObject({
      toolName: "create-budget-entry",
      resourceType: "budget_entry",
      resourceId: null,
      // Distinguishable from a saved change in the audit trail.
      outcome: "dry_run",
    })
  })

  it("update-budget-loan returns a summaryAfter identical to get-budget-summary", async () => {
    const { context } = await fixtures.createHousehold()
    const rows = await seedBudget(context)
    const session = fixtures.session(context, ["budget:write"])

    const update = await tool("update-budget-loan").invoke(
      { loanId: rows.loan.id, annualInterestRate: 4.75 },
      session
    )
    const summary = await tool("get-budget-summary").invoke({}, session)

    expect(update.isError).toBeUndefined()
    expect(
      (update.structuredContent as { summaryAfter: unknown }).summaryAfter
    ).toEqual(summary.structuredContent)
  })

  it("update-budget-member on another household is NOT_FOUND and audited", async () => {
    const owner = await fixtures.createHousehold()
    const intruder = await fixtures.createHousehold()
    const rows = await seedBudget(owner.context)
    const session = fixtures.session(intruder.context, ["budget:write"])

    const result = await tool("update-budget-member").invoke(
      { memberId: rows.member.id, grossMonthlyIncome: 1 },
      session
    )

    expect(result.structuredContent).toMatchObject({
      error: { code: "NOT_FOUND" },
    })
    const audit = await db.mcpAuditEvent.findFirstOrThrow({
      where: { correlationId: session.correlationId },
    })
    expect(audit.outcome).toBe("not_found")
  })
})
