import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"
import { z } from "zod"

import { createToolRegistry } from "../../mcp/tools"
import { createHouseholdFixtures } from "../../test/household-fixtures"
import type { ApplicationContext } from "../context"
import { calculateBudgetStats } from "./calculations"
import { getBudget } from "./read"
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
    amount: 1500,
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
        amount: 1,
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
})

describe("dry run", () => {
  it("reports the summary after the change but stores nothing", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    await seedBudget(context)
    const before = await freshSummary(context)

    const result = await createBudgetEntry(
      context,
      { name: "Bil", type: "EXPENSE", amount: 2500 },
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

    await updateBudgetSettings(
      context,
      { taxDeductionPercent: 22 },
      { dryRun: true }
    )

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
        amount: 1,
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

  it("rejects a batch above the limit", async () => {
    const { context } = await fixtures.createHousehold()

    await expect(
      addBudgetEntries(
        context,
        Array.from({ length: 101 }, (_, index) => ({
          name: `Post ${index}`,
          type: "EXPENSE" as const,
          amount: 1,
        }))
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("rejects a payment day outside 1–31 and an invalid date", async () => {
    const { context } = await fixtures.createHousehold()

    await expect(
      createBudgetEntry(context, {
        name: "X",
        type: "EXPENSE",
        amount: 1,
        paymentDay: 32,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(
      createBudgetEntry(context, {
        name: "X",
        type: "EXPENSE",
        amount: 1,
        renewalDate: "2027-02-30",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })
})

describe("new budget fields", () => {
  it("stores the optional fields and clears them with null", async () => {
    const { context } = await fixtures.createHousehold()
    const rows = await seedBudget(context)

    const entry = await updateBudgetEntry(context, rows.entry.id, {
      amount: 18_000,
      frequency: "YEARLY",
      provider: "  Tibber ",
      paymentDay: 20,
      renewalDate: "2027-03-01",
      notes: "Spotpris",
    })
    expect(entry.resource).toMatchObject({
      frequency: "YEARLY",
      provider: "Tibber",
      paymentDay: 20,
      notes: "Spotpris",
    })
    expect(entry.resource.renewalDate?.toISOString()).toBe(
      "2027-03-01T00:00:00.000Z"
    )
    if (!entry.summaryAfter.hasBudget) throw new Error("expected a budget")
    expect(entry.summaryAfter.entryExpenses).toBeCloseTo(1_500, 6)

    const cleared = await updateBudgetEntry(context, rows.entry.id, {
      provider: null,
      paymentDay: null,
      renewalDate: null,
      notes: "",
    })
    expect(cleared.resource).toMatchObject({
      provider: null,
      paymentDay: null,
      renewalDate: null,
      notes: null,
    })

    const member = await updateBudgetMember(context, rows.member.id, {
      netMonthlyIncome: 41_000,
    })
    expect(Number(member.resource.netMonthlyIncome)).toBe(41_000)
    if (!member.summaryAfter.hasBudget) throw new Error("expected a budget")
    expect(member.summaryAfter.totalNetIncome).toBe(41_000)

    const loan = await updateBudgetLoan(context, rows.loan.id, {
      loanType: "STUDENT",
      fixedRateUntil: "2028-01-01",
    })
    expect(loan.resource.loanType).toBe("STUDENT")

    const trip = await updateBudgetTrip(context, rows.trip.id, {
      otherPerTrip: 250,
    })
    expect(Number(trip.resource.otherPerTrip)).toBe(250)
    // Unchanged transport costs survive an update that does not mention them.
    expect(Number(trip.resource.tollPerTrip)).toBe(120)

    const settings = await updateBudgetSettings(context, {
      propertyValue: 6_000_000,
    })
    expect(Number(settings.resource.propertyValue)).toBe(6_000_000)
    expect(Number(settings.resource.taxDeductionPercent)).toBe(22)
  })

  it("does not bring back default categories the household deleted", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    await createBudgetMember(context, {
      name: "Ola",
      grossMonthlyIncome: 1,
      taxPercent: 1,
    })
    const categories = await db.budgetEntryCategory.findMany({
      where: { budget: { householdId } },
    })
    for (const category of categories) {
      await deleteBudgetCategory(context, category.id)
    }

    await createBudgetMember(context, {
      name: "Kari",
      grossMonthlyIncome: 1,
      taxPercent: 1,
    })

    expect(
      await db.budgetEntryCategory.count({ where: { budget: { householdId } } })
    ).toBe(0)
  })
})

describe("add budget entries", () => {
  it("resolves categories by name, creates missing ones and skips duplicates", async () => {
    const { context } = await fixtures.createHousehold()
    const rows = await seedBudget(context)

    const result = await addBudgetEntries(context, [
      { name: "strøm", type: "EXPENSE", amount: 1, categoryName: "BOLIG" },
      { name: "Strøm", type: "EXPENSE", amount: 1 },
      {
        name: "Bilforsikring",
        type: "EXPENSE",
        amount: 9_600,
        frequency: "YEARLY",
        categoryName: "Bil",
      },
      { name: "Bompenger", type: "EXPENSE", amount: 400, categoryName: "bil" },
      { name: "Bompenger", type: "EXPENSE", amount: 400, categoryName: "Bil" },
      {
        name: "Fond",
        type: "SAVINGS",
        amount: 2_000,
        categoryId: rows.category.id,
      },
    ])

    expect(result.resource.created.map((entry) => entry.name)).toEqual([
      "Strøm",
      "Bilforsikring",
      "Bompenger",
      "Fond",
    ])
    expect(result.resource.created[0]?.categoryId).toBeNull()
    expect(result.resource.skipped).toEqual([
      {
        index: 0,
        name: "strøm",
        existingEntryId: rows.entry.id,
        reason: "ALREADY_EXISTS",
      },
      {
        index: 4,
        name: "Bompenger",
        existingEntryId: null,
        reason: "DUPLICATE_IN_REQUEST",
      },
    ])
    expect(result.resource.createdCategories.map((c) => c.name)).toEqual([
      "Bil",
    ])
    if (!result.summaryAfter.hasBudget) throw new Error("expected a budget")
    expect(result.summaryAfter.totalSavings).toBe(2_000)
  })

  it("fails the whole batch on a foreign category or an invalid entry", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const foreign = await createBudgetCategory(other.context, {
      name: "Fremmed",
    })
    await seedBudget(owner.context)
    const countEntries = () =>
      db.budgetEntry.count({
        where: { budget: { householdId: owner.householdId } },
      })
    const before = await countEntries()

    await expect(
      addBudgetEntries(owner.context, [
        { name: "Grei", type: "EXPENSE", amount: 1, categoryName: "Ny" },
        {
          name: "Lekk",
          type: "EXPENSE",
          amount: 1,
          categoryId: foreign.resource.id,
        },
      ])
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      addBudgetEntries(owner.context, [
        { name: "Grei", type: "EXPENSE", amount: 1 },
        { name: "", type: "EXPENSE", amount: 1 },
      ])
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringMatching(/^Post 2:/),
    })

    expect(await countEntries()).toBe(before)
    expect(
      await db.budgetEntryCategory.count({
        where: { budget: { householdId: owner.householdId }, name: "Ny" },
      })
    ).toBe(0)
  })
})

describe("deletes", () => {
  it("previews a delete with dryRun and keeps the row", async () => {
    const { context } = await fixtures.createHousehold()
    const rows = await seedBudget(context)
    const before = await freshSummary(context)

    const result = await deleteBudgetLoan(context, rows.loan.id, {
      dryRun: true,
    })

    expect(result.dryRun).toBe(true)
    if (!result.summaryAfter.hasBudget) throw new Error("expected a budget")
    expect(result.summaryAfter.loanCount).toBe(0)
    expect(await db.budgetLoan.count({ where: { id: rows.loan.id } })).toBe(1)
    expect(await freshSummary(context)).toEqual(before)
  })

  it("keeps a deleted category's entries as uncategorized", async () => {
    const { context } = await fixtures.createHousehold()
    const rows = await seedBudget(context)

    const result = await deleteBudgetCategory(context, rows.category.id)

    expect(result.resource.uncategorizedEntryCount).toBe(1)
    const entry = await db.budgetEntry.findUniqueOrThrow({
      where: { id: rows.entry.id },
    })
    expect(entry.categoryId).toBeNull()
  })
})

describe("budget write tools", () => {
  it("create-budget-entry with dryRun previews, matches its schema and is audited", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    await seedBudget(context)
    const session = fixtures.session(context, ["budget:write"])
    const createTool = tool("create-budget-entry")

    const result = await createTool.invoke(
      {
        name: "Forsikring",
        type: "EXPENSE",
        amount: 9_600,
        frequency: "YEARLY",
        dryRun: true,
      },
      session
    )

    expect(result.isError).toBeUndefined()
    const parsed = z
      .object(createTool.outputSchema)
      .parse(result.structuredContent)
    expect(parsed).toMatchObject({
      dryRun: true,
      entry: {
        name: "Forsikring",
        amount: "9600",
        frequency: "YEARLY",
        monthlyAmount: "800.00",
        missingFields: ["provider", "paymentDay", "renewalDate"],
      },
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

  it("delete-budget-entry deletes, is audited and answers NOT_FOUND when repeated", async () => {
    const { context } = await fixtures.createHousehold()
    const rows = await seedBudget(context)
    const session = fixtures.session(context, ["budget:write"])
    const deleteTool = tool("delete-budget-entry")

    const result = await deleteTool.invoke({ entryId: rows.entry.id }, session)

    expect(result.isError).toBeUndefined()
    z.object(deleteTool.outputSchema).parse(result.structuredContent)
    expect(await db.budgetEntry.count({ where: { id: rows.entry.id } })).toBe(0)
    const audit = await db.mcpAuditEvent.findFirstOrThrow({
      where: { correlationId: session.correlationId },
    })
    expect(audit).toMatchObject({
      toolName: "delete-budget-entry",
      resourceId: rows.entry.id,
      outcome: "success",
    })

    const again = await deleteTool.invoke(
      { entryId: rows.entry.id },
      fixtures.session(context, ["budget:write"])
    )
    expect(again.structuredContent).toMatchObject({
      error: { code: "NOT_FOUND" },
    })
  })

  it("add-budget-entries and get-budget-details match their schemas", async () => {
    const { context } = await fixtures.createHousehold()
    await seedBudget(context)
    const session = fixtures.session(context, ["budget:read", "budget:write"])
    const addTool = tool("add-budget-entries")
    const detailsTool = tool("get-budget-details")

    const added = await addTool.invoke(
      {
        entries: [
          {
            name: "BSU",
            type: "SAVINGS",
            amount: 2_292,
            categoryName: "Sparing",
          },
          { name: "Strøm", type: "EXPENSE", amount: 1, categoryName: "Bolig" },
        ],
      },
      session
    )
    expect(added.isError).toBeUndefined()
    const parsed = z.object(addTool.outputSchema).parse(added.structuredContent)
    expect(parsed).toMatchObject({
      created: [{ name: "BSU", category: { name: "Sparing" } }],
      skipped: [{ name: "Strøm", reason: "ALREADY_EXISTS" }],
      createdCategories: [{ name: "Sparing" }],
    })

    const details = await detailsTool.invoke({}, session)
    const detailsParsed = z
      .object(detailsTool.outputSchema)
      .parse(details.structuredContent)
    expect(detailsParsed).toMatchObject({
      propertyValue: null,
      missingFields: ["propertyValue"],
      members: [{ missingFields: ["netMonthlyIncome"] }],
      loans: [{ missingFields: ["fixedRateUntil"] }],
    })
  })
})
