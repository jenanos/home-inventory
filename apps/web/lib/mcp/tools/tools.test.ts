import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const mocks = vi.hoisted(() => ({
  shoppingListCount: vi.fn(),
  shoppingListFindMany: vi.fn(),
  shoppingListFindFirst: vi.fn(),
  shoppingItemCount: vi.fn(),
  shoppingItemFindMany: vi.fn(),
  shoppingItemGroupBy: vi.fn(),
  categoryCount: vi.fn(),
  categoryFindMany: vi.fn(),
  budgetFindUnique: vi.fn(),
  budgetMemberFindMany: vi.fn(),
  budgetLoanFindMany: vi.fn(),
  budgetLoanCount: vi.fn(),
  budgetTripFindMany: vi.fn(),
  budgetEntryCategoryFindMany: vi.fn(),
  budgetEntryFindMany: vi.fn(),
  budgetEntryCount: vi.fn(),
  projectCount: vi.fn(),
  projectFindMany: vi.fn(),
  projectFindFirst: vi.fn(),
  plantCount: vi.fn(),
  plantFindMany: vi.fn(),
  plantFindFirst: vi.fn(),
}))

vi.mock("@workspace/db", async (importOriginal) => ({
  // The real module supplies the runtime enums the write services validate
  // against; only the client is replaced.
  ...(await importOriginal<typeof import("@workspace/db")>()),
  db: {
    shoppingList: {
      count: mocks.shoppingListCount,
      findMany: mocks.shoppingListFindMany,
      findFirst: mocks.shoppingListFindFirst,
    },
    shoppingItem: {
      count: mocks.shoppingItemCount,
      findMany: mocks.shoppingItemFindMany,
      groupBy: mocks.shoppingItemGroupBy,
    },
    category: {
      count: mocks.categoryCount,
      findMany: mocks.categoryFindMany,
    },
    budget: { findUnique: mocks.budgetFindUnique },
    budgetMember: { findMany: mocks.budgetMemberFindMany },
    budgetLoan: {
      findMany: mocks.budgetLoanFindMany,
      count: mocks.budgetLoanCount,
    },
    budgetTrip: { findMany: mocks.budgetTripFindMany },
    budgetEntryCategory: { findMany: mocks.budgetEntryCategoryFindMany },
    budgetEntry: {
      findMany: mocks.budgetEntryFindMany,
      count: mocks.budgetEntryCount,
    },
    project: {
      count: mocks.projectCount,
      findMany: mocks.projectFindMany,
      findFirst: mocks.projectFindFirst,
    },
    plant: {
      count: mocks.plantCount,
      findMany: mocks.plantFindMany,
      findFirst: mocks.plantFindFirst,
    },
  },
}))

import type { McpSession } from "../auth/session"
import { MCP_SCOPES, type McpScope } from "../oauth/scopes"
import { createToolRegistry, type McpToolDefinition } from "./index"

/** Stand-in for `Prisma.Decimal`: only `toString` and `toNumber` are used. */
function decimal(value: string) {
  return { toString: () => value, toNumber: () => Number(value) }
}

const LIST_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const PLANT_ID = "33333333-3333-4333-8333-333333333333"

/**
 * Values that must never appear in a tool response: fields that exist in the
 * database rows but are not on any tool's whitelist.
 */
const POISON = {
  email: "annen.bruker@example.com",
  shareToken: "share-token-should-not-leak",
  assignee: "Assigned Person",
}

const registry = createToolRegistry(() => new Date("2026-08-03T09:00:00Z"))

function tool(name: string): McpToolDefinition {
  const found = registry.find((candidate) => candidate.name === name)
  if (!found) {
    throw new Error(`Unknown tool: ${name}`)
  }

  return found
}

function session(scopes: McpScope[] = [...MCP_SCOPES]): McpSession {
  return {
    context: { userId: "user-1", householdId: "household-1", role: "MEMBER" },
    scopes,
    clientId: "client-1",
    tokenId: "token-1",
  }
}

async function callTool(name: string, args: unknown = {}, scopes?: McpScope[]) {
  const result = await tool(name).invoke(args, session(scopes))
  const structured = result.structuredContent as Record<string, unknown>

  return { result, structured }
}

function isReadOnly(entry: McpToolDefinition) {
  return entry.annotations.readOnlyHint === true
}

function expectMatchesOutputSchema(name: string, structured: unknown) {
  const parsed = z.object(tool(name).outputSchema).safeParse(structured)

  if (!parsed.success) {
    throw new Error(
      `${name} response does not match its output schema: ${parsed.error.message}`
    )
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  mocks.shoppingListCount.mockResolvedValue(3)
  mocks.shoppingListFindMany.mockResolvedValue([
    {
      id: LIST_ID,
      name: "Kjøkken",
      color: "#fff",
      isPrivate: false,
      projectId: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-02-01T00:00:00Z"),
      items: [
        {
          status: "PENDING",
          estimatedPrice: decimal("100.50"),
          alternatives: [{ price: decimal("90.25") }],
        },
        {
          status: "PURCHASED",
          estimatedPrice: decimal("10"),
          alternatives: [],
        },
      ],
    },
  ])
  mocks.shoppingListFindFirst.mockResolvedValue({
    id: LIST_ID,
    name: "Kjøkken",
    color: null,
    isPrivate: false,
    projectId: PROJECT_ID,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-02-01T00:00:00Z"),
    // Present on the browser-facing read of the same table. Swapping the tool
    // over to that query would surface these, which is what POISON catches.
    shareLinks: [{ id: "share-1", token: POISON.shareToken, isActive: true }],
    household: {
      members: [{ user: { id: "user-2", name: "Annen", email: POISON.email } }],
    },
  })
  mocks.shoppingItemGroupBy.mockResolvedValue([
    { status: "PENDING", _count: { _all: 2 } },
    { status: "PURCHASED", _count: { _all: 1 } },
  ])
  mocks.shoppingItemCount.mockResolvedValue(3)
  mocks.shoppingItemFindMany.mockResolvedValue([
    {
      id: "item-1",
      name: "Stekepanne",
      description: null,
      status: "PENDING",
      priority: "MEDIUM",
      timeframe: null,
      dueDate: new Date("2026-03-15T00:00:00Z"),
      estimatedPrice: decimal("499.00"),
      url: null,
      imageUrl: null,
      storeName: "Butikk",
      purchasedAt: null,
      createdAt: new Date("2026-01-02T00:00:00Z"),
      updatedAt: new Date("2026-01-03T00:00:00Z"),
      category: { id: "cat-1", name: "Kjøkken" },
      alternatives: [
        {
          id: "alt-1",
          name: "Billigere panne",
          price: decimal("299.00"),
          url: null,
          imageUrl: null,
          storeName: null,
          notes: null,
          rank: 0,
          updatedAt: new Date("2026-02-02T00:00:00Z"),
        },
      ],
      _count: { alternatives: 1 },
      list: { id: LIST_ID, name: "Kjøkken" },
      // Present on the row, absent from every whitelist.
      assignedTo: { id: "user-2", name: POISON.assignee, email: POISON.email },
    },
  ])
  mocks.categoryCount.mockResolvedValue(1)
  mocks.categoryFindMany.mockResolvedValue([
    { id: "cat-1", name: "Kjøkken", icon: null, color: null, isDefault: true },
  ])

  mocks.budgetFindUnique.mockResolvedValue({
    id: "budget-1",
    taxDeductionPercent: decimal("22"),
    propertyValue: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-02-01T00:00:00Z"),
    categories: [
      {
        id: "bc-1",
        name: "Bolig",
        sortOrder: 0,
        updatedAt: new Date("2026-02-02T00:00:00Z"),
      },
    ],
    members: [
      {
        id: "bm-1",
        name: "Medlem",
        grossMonthlyIncome: decimal("60000"),
        taxPercent: decimal("35"),
        netMonthlyIncome: null,
        notes: null,
        sortOrder: 0,
        updatedAt: new Date("2026-02-02T00:00:00Z"),
      },
    ],
    loans: [
      {
        id: "bl-1",
        bankName: "Bank",
        loanName: "Boliglån",
        loanType: "MORTGAGE",
        repaymentType: "ANNUITY",
        principalAmount: decimal("3000000"),
        annualInterestRate: decimal("5.5"),
        termMonths: 300,
        monthlyFees: decimal("65"),
        fixedRateUntil: new Date("2028-06-01T00:00:00Z"),
        notes: "Fastrente 3 år",
        sortOrder: 0,
        updatedAt: new Date("2026-02-02T00:00:00Z"),
      },
    ],
    trips: [
      {
        id: "bt-1",
        name: "Hyttetur",
        transportType: "CAR",
        annualTrips: 6,
        ticketPerTrip: null,
        tollPerTrip: decimal("120"),
        ferryPerTrip: null,
        fuelPerTrip: decimal("500"),
        otherPerTrip: null,
        notes: null,
        sortOrder: 0,
        updatedAt: new Date("2026-02-02T00:00:00Z"),
      },
    ],
    entries: [
      {
        id: "be-1",
        name: "Strøm",
        type: "EXPENSE",
        amount: decimal("18000"),
        frequency: "YEARLY",
        provider: "Tibber",
        paymentDay: null,
        renewalDate: null,
        notes: null,
        sortOrder: 0,
        updatedAt: new Date("2026-02-02T00:00:00Z"),
        category: { id: "bc-1", name: "Bolig" },
      },
    ],
  })
  mocks.budgetMemberFindMany.mockImplementation(
    async () => (await mocks.budgetFindUnique()).members
  )
  mocks.budgetLoanFindMany.mockImplementation(
    async () => (await mocks.budgetFindUnique()).loans
  )
  mocks.budgetTripFindMany.mockImplementation(
    async () => (await mocks.budgetFindUnique()).trips
  )
  mocks.budgetEntryCategoryFindMany.mockImplementation(
    async () => (await mocks.budgetFindUnique()).categories
  )
  mocks.budgetEntryFindMany.mockImplementation(
    async () => (await mocks.budgetFindUnique()).entries
  )
  mocks.budgetEntryCount.mockResolvedValue(1)
  mocks.budgetLoanCount.mockResolvedValue(1)

  mocks.projectCount.mockResolvedValue(1)
  mocks.projectFindMany.mockResolvedValue([
    {
      id: PROJECT_ID,
      title: "Male veggen",
      type: "RENOVATION",
      execution: "SELF",
      status: "NOT_STARTED",
      priority: "HIGH",
      estimatedDuration: "2 dager",
      estimatedPrice: decimal("5000"),
      dueDate: new Date("2026-05-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      steps: [{ completed: true }, { completed: false }],
      _count: { vendors: 1, shoppingLists: 1 },
    },
  ])
  mocks.projectFindFirst.mockResolvedValue({
    id: PROJECT_ID,
    title: "Male veggen",
    description: "Stue og gang",
    type: "RENOVATION",
    execution: "MIXED",
    status: "NOT_STARTED",
    priority: "HIGH",
    estimatedDuration: "2 dager",
    estimatedPrice: decimal("5000"),
    dueDate: new Date("2026-05-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    vendors: [
      {
        id: "vendor-1",
        name: "Maler AS",
        description: null,
        phone: "12345678",
        email: "post@maler.example",
        website: null,
        estimatedPrice: decimal("4800"),
        notes: null,
        isSelected: true,
        updatedAt: new Date("2026-02-02T00:00:00Z"),
      },
    ],
    shoppingLists: [
      {
        id: LIST_ID,
        name: "Maling",
        color: null,
        isPrivate: false,
        updatedAt: new Date("2026-02-02T00:00:00Z"),
        items: [
          {
            status: "PURCHASED",
            estimatedPrice: null,
            alternatives: [{ price: decimal("499.90") }],
          },
          {
            status: "PENDING",
            estimatedPrice: decimal("120"),
            alternatives: [],
          },
          {
            status: "SKIPPED",
            estimatedPrice: decimal("999"),
            alternatives: [],
          },
        ],
      },
    ],
    steps: [
      {
        id: "step-1",
        title: "Kjøpe maling",
        description: null,
        dueDate: null,
        completed: true,
        completedAt: new Date("2026-01-05T10:00:00Z"),
        sortOrder: 0,
        updatedAt: new Date("2026-02-02T00:00:00Z"),
      },
    ],
  })

  mocks.plantCount.mockResolvedValue(1)
  mocks.plantFindMany.mockResolvedValue([
    {
      id: PLANT_ID,
      name: "Basilikum",
      species: null,
      location: "Kjøkkenvindu",
      plantType: "HERB",
      lifecycle: "ANNUAL",
      wateringNeed: "HIGH",
      wateringMethod: "MANUAL",
      sunNeed: "FULL_SUN",
      isToxic: false,
      lastWateredAt: new Date("2026-08-01T07:00:00Z"),
      updatedAt: new Date("2026-08-01T07:00:00Z"),
    },
  ])
  mocks.plantFindFirst.mockResolvedValue({
    id: PLANT_ID,
    name: "Basilikum",
    species: "Ocimum basilicum",
    location: "Kjøkkenvindu",
    description: null,
    careInstructions: "Vann ofte",
    plantType: "HERB",
    lifecycle: "ANNUAL",
    wateringNeed: "HIGH",
    wateringMethod: "MANUAL",
    sunNeed: "FULL_SUN",
    soilType: null,
    fertilizer: null,
    hardinessZone: null,
    bloomTime: null,
    pruningSeason: null,
    pests: null,
    notes: null,
    isToxic: false,
    toxicityNotes: null,
    plantedAt: new Date("2026-04-01T00:00:00Z"),
    lastWateredAt: new Date("2026-08-01T07:00:00Z"),
    lastPrunedAt: null,
    imageUrl: "https://example.com/basil.png",
    sourceUrl: null,
    householdId: "household-1",
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T07:00:00Z"),
  })
})

const HAPPY_PATH_ARGS: Array<[string, Record<string, unknown>]> = [
  ["get-server-info", {}],
  ["list-shopping-lists", {}],
  ["get-shopping-list", { listId: LIST_ID, includeAlternatives: true }],
  ["search-shopping-items", { query: "panne", includeAlternatives: true }],
  ["list-shopping-categories", {}],
  ["get-budget-summary", {}],
  ["get-budget-details", {}],
  ["list-projects", {}],
  ["get-project", { projectId: PROJECT_ID }],
  ["list-plants", {}],
  ["get-plant", { plantId: PLANT_ID }],
]

describe("level 1 tool contracts", () => {
  it("registers exactly the documented level 1 surface, all read-only", () => {
    const readTools = registry.filter((entry) => isReadOnly(entry))

    expect(readTools.map((entry) => entry.name)).toEqual(
      HAPPY_PATH_ARGS.map(([name]) => name)
    )
  })

  it.each(HAPPY_PATH_ARGS)(
    "%s returns a response matching its output schema",
    async (name, args) => {
      const { result, structured } = await callTool(name, args)

      expect(result.isError).toBeUndefined()
      expectMatchesOutputSchema(name, structured)
      // The text summary exists and is short: it explains the payload, it is
      // not a second copy of it.
      expect(result.content?.[0]).toMatchObject({ type: "text" })
    }
  )

  it.each(HAPPY_PATH_ARGS)(
    "%s returns no field outside its whitelist",
    async (name, args) => {
      const { structured } = await callTool(name, args)
      const serialized = JSON.stringify(structured)

      for (const value of Object.values(POISON)) {
        expect(serialized).not.toContain(value)
      }
    }
  )
})

describe("scope enforcement in tools/call", () => {
  it.each(HAPPY_PATH_ARGS.filter(([name]) => name !== "get-server-info"))(
    "%s refuses a token without its scope",
    async (name, args) => {
      // Every scope except the one this tool needs, so the failure cannot be
      // explained by an empty scope set.
      const required = tool(name).scope
      const scopes = MCP_SCOPES.filter(
        (scope) =>
          scope !== required && !scope.startsWith(`${required?.split(":")[0]}:`)
      )

      const { result, structured } = await callTool(name, args, scopes)

      expect(result.isError).toBe(true)
      expect(structured).toMatchObject({
        error: { code: "SCOPE_REQUIRED" },
      })
    }
  )

  it("lets get-server-info run on any valid token", async () => {
    const { result, structured } = await callTool("get-server-info", {}, [
      "garden:read",
    ])

    expect(result.isError).toBeUndefined()
    expect(structured).toMatchObject({
      availableDomains: ["garden"],
      grantedScopes: ["garden:read"],
    })
  })
})

describe("tool input validation", () => {
  it("rejects a limit above the maximum instead of clamping it", async () => {
    const { result, structured } = await callTool("list-plants", { limit: 500 })

    expect(result.isError).toBe(true)
    expect(structured).toMatchObject({ error: { code: "VALIDATION_ERROR" } })
  })

  it("rejects an unknown enum value", async () => {
    const { structured } = await callTool("list-projects", {
      status: "ALMOST_DONE",
    })

    expect(structured).toMatchObject({ error: { code: "VALIDATION_ERROR" } })
  })

  it("rejects a tampered cursor", async () => {
    const { structured } = await callTool("list-plants", {
      cursor: "not-a-cursor",
    })

    expect(structured).toMatchObject({ error: { code: "VALIDATION_ERROR" } })
  })

  it("converts a YYYY-MM-DD filter to midnight UTC", async () => {
    await callTool("list-projects", { dueBefore: "2026-06-30" })

    expect(mocks.projectCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        dueDate: { lte: new Date("2026-06-30T00:00:00.000Z") },
      }),
    })
  })
})

describe("resource boundaries", () => {
  it("gives the same answer for an unknown list and one the user may not see", async () => {
    mocks.shoppingListFindFirst.mockResolvedValue(null)

    const { result, structured } = await callTool("get-shopping-list", {
      listId: LIST_ID,
    })

    expect(result.isError).toBe(true)
    expect(structured).toMatchObject({ error: { code: "NOT_FOUND" } })
    // No item query ran, so nothing about the list's contents was observable.
    expect(mocks.shoppingItemFindMany).not.toHaveBeenCalled()
  })

  it.each([
    ["get-shopping-list", "listId"],
    ["get-project", "projectId"],
    ["get-plant", "plantId"],
  ])("%s rejects a malformed id as a validation error", async (name, field) => {
    const { structured } = await callTool(name, { [field]: "../../etc/passwd" })

    expect(structured).toMatchObject({ error: { code: "VALIDATION_ERROR" } })
  })

  it("bounds shopping items by the parent list's visibility", async () => {
    await callTool("get-shopping-list", { listId: LIST_ID })

    expect(mocks.shoppingItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          listId: LIST_ID,
          list: {
            householdId: "household-1",
            OR: [{ isPrivate: false }, { createdById: "user-1" }],
          },
        },
      })
    )
  })

  it("bounds cross-list search by list visibility", async () => {
    await callTool("search-shopping-items", { timeframe: "SOON" })

    expect(mocks.shoppingItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          list: {
            householdId: "household-1",
            OR: [{ isPrivate: false }, { createdById: "user-1" }],
          },
          timeframe: "SOON",
        },
      })
    )
  })

  it("never takes a household id from tool input", async () => {
    await callTool("list-plants", { householdId: "household-2" })

    expect(mocks.plantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ householdId: "household-1" }),
      })
    )
  })
})

describe("budget contract", () => {
  it("reports a household without a budget as hasBudget: false, not NOT_FOUND", async () => {
    mocks.budgetFindUnique.mockResolvedValue(null)

    const summary = await callTool("get-budget-summary")
    const details = await callTool("get-budget-details")

    expect(summary.result.isError).toBeUndefined()
    expect(summary.structured).toMatchObject({
      hasBudget: false,
      currency: "NOK",
      totals: null,
    })
    expect(details.structured).toMatchObject({ hasBudget: false })
    expectMatchesOutputSchema("get-budget-summary", summary.structured)
    expectMatchesOutputSchema("get-budget-details", details.structured)
  })

  it("serializes stored amounts exactly and calculated amounts to two decimals", async () => {
    const { structured } = await callTool("get-budget-details", {
      sections: ["members"],
    })

    expect(structured).toMatchObject({
      members: [{ grossMonthlyIncome: "60000", taxPercent: "35" }],
      loans: null,
      trips: null,
    })

    const summary = await callTool("get-budget-summary")
    const totals = (summary.structured as { totals: Record<string, string> })
      .totals

    for (const amount of Object.values(totals)) {
      expect(amount).toMatch(/^-?\d+\.\d{2}$/)
    }
    expect(summary.structured).toMatchObject({
      keyFigures: { loanToValuePercent: null },
    })
  })

  it("converts entry frequencies and reports empty optional fields", async () => {
    const { structured } = await callTool("get-budget-details", {
      sections: ["entries", "loans"],
    })

    expect(structured).toMatchObject({
      propertyValue: null,
      missingFields: ["propertyValue"],
      entries: [
        {
          amount: "18000",
          frequency: "YEARLY",
          monthlyAmount: "1500.00",
          provider: "Tibber",
          missingFields: ["paymentDay", "renewalDate"],
        },
      ],
      loans: [
        {
          fixedRateUntil: "2028-06-01",
          notes: "Fastrente 3 år",
          missingFields: [],
        },
      ],
    })
    expectMatchesOutputSchema("get-budget-details", structured)
  })

  it("only fetches the sections that were asked for", async () => {
    await callTool("get-budget-details", { sections: ["entries"] })

    expect(mocks.budgetEntryFindMany).toHaveBeenCalled()
    expect(mocks.budgetMemberFindMany).not.toHaveBeenCalled()
    expect(mocks.budgetLoanFindMany).not.toHaveBeenCalled()
  })
})

describe("pagination in responses", () => {
  it("reports the total and a next cursor when more remain", async () => {
    const { structured } = await callTool("list-shopping-lists", { limit: 1 })

    expect(structured.pageInfo).toMatchObject({
      totalCount: 3,
      returnedCount: 1,
      hasMore: true,
    })
    expect(
      (structured.pageInfo as { nextCursor: string }).nextCursor
    ).toBeTruthy()
  })

  it("applies the default page size to the query", async () => {
    await callTool("list-plants", {})

    expect(mocks.plantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 25 })
    )
  })

  it("counts statuses across the whole list, not just the current page", async () => {
    const { structured } = await callTool("get-shopping-list", {
      listId: LIST_ID,
      status: "PENDING",
      limit: 1,
    })

    expect(structured.itemCounts).toEqual({
      total: 3,
      pending: 2,
      purchased: 1,
      skipped: 0,
    })
  })
})

describe("project reads", () => {
  it("summarizes linked shopping lists without skipped items", async () => {
    const { structured } = await callTool("get-project", {
      projectId: PROJECT_ID,
    })

    expect(structured).toMatchObject({
      project: { type: "RENOVATION", execution: "MIXED" },
      shoppingLists: [
        {
          id: LIST_ID,
          itemCount: 2,
          pendingCount: 1,
          purchasedCount: 1,
          estimatedTotal: "619.90",
          purchasedTotal: "499.90",
        },
      ],
    })
  })

  it("only includes linked lists the user may see", async () => {
    await callTool("get-project", { projectId: PROJECT_ID })

    expect(mocks.projectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PROJECT_ID, householdId: "household-1" },
        select: expect.objectContaining({
          shoppingLists: expect.objectContaining({
            where: {
              householdId: "household-1",
              OR: [{ isPrivate: false }, { createdById: "user-1" }],
            },
          }),
        }),
      })
    )
  })

  it("counts completed steps and filters active projects", async () => {
    const { structured } = await callTool("list-projects", {
      activeOnly: true,
      type: "RENOVATION",
    })

    expect(mocks.projectCount).toHaveBeenCalledWith({
      where: {
        householdId: "household-1",
        status: { not: "COMPLETED" },
        type: "RENOVATION",
      },
    })
    expect(structured).toMatchObject({
      projects: [
        {
          execution: "SELF",
          stepCount: 2,
          completedStepCount: 1,
          vendorCount: 1,
          shoppingListCount: 1,
        },
      ],
    })
  })
})
