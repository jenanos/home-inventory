import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const mocks = vi.hoisted(() => ({
  shoppingListCount: vi.fn(),
  shoppingListFindMany: vi.fn(),
  shoppingListFindFirst: vi.fn(),
  shoppingItemCount: vi.fn(),
  shoppingItemFindMany: vi.fn(),
  shoppingItemGroupBy: vi.fn(),
  shoppingItemDealCount: vi.fn(),
  shoppingItemDealFindMany: vi.fn(),
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
  gardenBedFindMany: vi.fn(),
  gardenBedFindFirst: vi.fn(),
  attachmentFindMany: vi.fn(),
  attachmentFindFirst: vi.fn(),
  calendarEventFindMany: vi.fn(),
  calendarEventFindFirst: vi.fn(),
  packingListCount: vi.fn(),
  packingListFindMany: vi.fn(),
  packingListFindFirst: vi.fn(),
  packingBundleCount: vi.fn(),
  packingBundleFindMany: vi.fn(),
  packingBundleFindFirst: vi.fn(),
  packingPersonFindMany: vi.fn(),
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
    shoppingItemDeal: {
      count: mocks.shoppingItemDealCount,
      findMany: mocks.shoppingItemDealFindMany,
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
    gardenBed: {
      findMany: mocks.gardenBedFindMany,
      findFirst: mocks.gardenBedFindFirst,
    },
    attachment: {
      findMany: mocks.attachmentFindMany,
      findFirst: mocks.attachmentFindFirst,
    },
    calendarEvent: {
      findMany: mocks.calendarEventFindMany,
      findFirst: mocks.calendarEventFindFirst,
    },
    packingList: {
      count: mocks.packingListCount,
      findMany: mocks.packingListFindMany,
      findFirst: mocks.packingListFindFirst,
    },
    packingBundle: {
      count: mocks.packingBundleCount,
      findMany: mocks.packingBundleFindMany,
      findFirst: mocks.packingBundleFindFirst,
    },
    packingPerson: { findMany: mocks.packingPersonFindMany },
  },
}))

import type { McpSession } from "../auth/session"
import { MCP_SCOPES, type McpScope } from "../oauth/scopes"
import { toolScopes } from "./define"
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
      eventId: null,
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
    eventId: null,
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
      dueDate: new Date("2026-03-15T00:00:00Z"),
      estimatedPrice: decimal("499.00"),
      url: null,
      imageUrl: null,
      storeName: "Butikk",
      purchasedAt: null,
      dealWatch: true,
      dealWatchNote: "Støpejern, 28 cm",
      dealTargetPrice: decimal("350.00"),
      dealCheckedAt: null,
      deal: null,
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
  mocks.shoppingItemDealCount.mockResolvedValue(1)
  mocks.shoppingItemDealFindMany.mockResolvedValue([
    {
      store: "Kjøkkenbutikken",
      productName: "Skeppshult 28 cm",
      price: decimal("349.00"),
      regularPrice: decimal("599.00"),
      priceNote: null,
      url: "https://example.com/panne",
      validFrom: null,
      validTo: new Date("2026-08-09T00:00:00Z"),
      reportedAt: new Date("2026-08-03T06:00:00Z"),
      item: {
        id: "item-1",
        name: "Stekepanne",
        imageUrl: null,
        estimatedPrice: decimal("499.00"),
        dealWatch: true,
        dealTargetPrice: decimal("350.00"),
        list: { id: LIST_ID, name: "Kjøkken", isPrivate: false },
        alternatives: [{ price: decimal("299.00"), imageUrl: null }],
        // Present on the row, absent from every whitelist.
        assignedTo: { name: POISON.assignee, email: POISON.email },
      },
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
      scale: "ROUTINE",
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
    scale: "MAJOR",
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
  mocks.plantFindMany.mockResolvedValue([{ ...PLANT_ROW, species: null }])
  mocks.plantFindFirst.mockResolvedValue(PLANT_ROW)
  mocks.gardenBedFindMany.mockResolvedValue([BED])
  mocks.gardenBedFindFirst.mockResolvedValue(BED)
  mocks.attachmentFindMany.mockResolvedValue([ATTACHMENT])
  mocks.attachmentFindFirst.mockResolvedValue(ATTACHMENT)
  mocks.calendarEventFindMany.mockResolvedValue([EVENT_ROW])
  mocks.calendarEventFindFirst.mockResolvedValue(EVENT_ROW)
  mocks.packingListCount.mockResolvedValue(1)
  mocks.packingListFindMany.mockResolvedValue([PACKING_LIST_ROW])
  mocks.packingListFindFirst.mockResolvedValue(PACKING_LIST_ROW)
  mocks.packingBundleCount.mockResolvedValue(1)
  mocks.packingBundleFindMany.mockResolvedValue([BUNDLE_ROW])
  mocks.packingBundleFindFirst.mockResolvedValue(BUNDLE_ROW)
  mocks.packingPersonFindMany.mockResolvedValue([PERSON])
})

const EVENT_ID = "77777777-7777-4777-8777-777777777777"
const PACKING_LIST_ID = "88888888-8888-4888-8888-888888888888"
const BUNDLE_ID = "99999999-9999-4999-8999-999999999999"

const EVENT_ROW = {
  id: EVENT_ID,
  householdId: "household-1",
  title: "Mormor",
  type: "BIRTHDAY",
  recurrence: "YEARLY",
  month: 8,
  day: 20,
  year: 1946,
  notes: "Liker lyng",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  shoppingLists: [
    {
      id: LIST_ID,
      name: "Gaver til Mormor",
      color: null,
      isPrivate: false,
      updatedAt: new Date("2026-02-01T00:00:00Z"),
      items: [
        {
          id: "item-1",
          name: "Lyngplante",
          description: null,
          status: "PENDING",
          priority: "MEDIUM",
          estimatedPrice: decimal("249"),
          url: null,
          storeName: null,
          updatedAt: new Date("2026-02-01T00:00:00Z"),
          alternatives: [],
          // On the row, never on the whitelist.
          assignedTo: { name: POISON.assignee },
        },
      ],
    },
  ],
}

const BUNDLE_REF = { id: BUNDLE_ID, name: "Treningstøy" }

const PERSON = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Ola",
  updatedAt: new Date("2026-03-01T00:00:00Z"),
}

const PACKING_LIST_ROW = {
  id: PACKING_LIST_ID,
  householdId: "household-1",
  name: "Hytta påske",
  season: "SPRING",
  duration: "WEEKEND",
  abroad: false,
  departureOn: new Date("2026-04-01T00:00:00Z"),
  notes: null,
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-03-01T00:00:00Z"),
  items: [
    {
      id: "packing-item-1",
      listId: PACKING_LIST_ID,
      name: "Joggesko",
      quantity: 1,
      packed: true,
      notes: null,
      sortOrder: 0,
      bundleId: BUNDLE_ID,
      bundle: BUNDLE_REF,
      personId: PERSON.id,
      person: { id: PERSON.id, name: PERSON.name },
      createdAt: new Date("2026-03-01T00:00:00Z"),
      updatedAt: new Date("2026-03-01T00:00:00Z"),
    },
    {
      id: "packing-item-2",
      listId: PACKING_LIST_ID,
      name: "Ullsokker",
      quantity: 3,
      packed: false,
      notes: null,
      sortOrder: 1,
      bundleId: null,
      bundle: null,
      personId: null,
      person: null,
      createdAt: new Date("2026-03-01T00:00:00Z"),
      updatedAt: new Date("2026-03-01T00:00:00Z"),
    },
  ],
}

const BUNDLE_ROW = {
  ...BUNDLE_REF,
  householdId: "household-1",
  description: null,
  seasons: [],
  durations: ["WEEKEND", "WEEK"],
  abroadOnly: false,
  autoAdd: false,
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-03-01T00:00:00Z"),
  items: [
    {
      id: "bundle-item-1",
      bundleId: BUNDLE_ID,
      name: "Joggesko",
      quantity: 1,
      notes: null,
      sortOrder: 0,
      createdAt: new Date("2026-03-01T00:00:00Z"),
      updatedAt: new Date("2026-03-01T00:00:00Z"),
    },
  ],
}

const BED_ID = "44444444-4444-4444-8444-444444444444"
const ATTACHMENT_ID = "66666666-6666-4666-8666-666666666666"

/** A PDF, so the read path needs no image decoding in a unit test. */
const ATTACHMENT = {
  id: ATTACHMENT_ID,
  plantId: PLANT_ID,
  bedId: null,
  projectId: null,
  kind: "DOCUMENT",
  fileName: "stell.pdf",
  contentType: "application/pdf",
  byteSize: 2048,
  width: null,
  height: null,
  sha256: "abc",
  caption: null,
  sortOrder: 0,
  source: "UPLOAD",
  sourceUrl: null,
  createdAt: new Date("2026-08-01T07:00:00Z"),
  updatedAt: new Date("2026-08-01T07:00:00Z"),
}

const PLACEMENT = {
  id: "55555555-5555-4555-8555-555555555555",
  bedId: BED_ID,
  quantity: 2,
  notes: null,
  updatedAt: new Date("2026-08-01T07:00:00Z"),
  bed: { id: BED_ID, name: "Kjøkkenvindu" },
}

const BED = {
  id: BED_ID,
  name: "Kjøkkenvindu",
  description: null,
  sunExposure: "FULL_SUN",
  notes: null,
  householdId: "household-1",
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T07:00:00Z"),
  placements: [
    {
      id: PLACEMENT.id,
      quantity: 2,
      notes: null,
      updatedAt: new Date("2026-08-01T07:00:00Z"),
      plant: { id: PLANT_ID, name: "Basilikum", species: null },
    },
  ],
}

const PLANT_ROW = {
  id: PLANT_ID,
  name: "Basilikum",
  species: "Ocimum basilicum",
  placements: [PLACEMENT],
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
}

const HAPPY_PATH_ARGS: Array<[string, Record<string, unknown>]> = [
  ["get-server-info", {}],
  ["list-shopping-lists", {}],
  ["get-shopping-list", { listId: LIST_ID, includeAlternatives: true }],
  ["search-shopping-items", { query: "panne", includeAlternatives: true }],
  ["list-shopping-categories", {}],
  ["list-shopping-deals", {}],
  ["list-deal-watch-items", {}],
  ["get-budget-summary", {}],
  ["get-budget-details", {}],
  ["list-projects", {}],
  ["get-project", { projectId: PROJECT_ID }],
  ["list-plants", {}],
  ["get-plant", { plantId: PLANT_ID }],
  ["list-garden-beds", {}],
  ["get-garden-bed", { bedId: BED_ID }],
  ["list-events", {}],
  ["get-event", { eventId: EVENT_ID }],
  ["list-packing-lists", {}],
  ["get-packing-list", { listId: PACKING_LIST_ID }],
  ["list-packing-bundles", {}],
  ["get-packing-bundle", { bundleId: BUNDLE_ID }],
  ["list-packing-persons", {}],
  ["list-attachments", { targetType: "plant", targetId: PLANT_ID }],
  ["get-attachment", { attachmentId: ATTACHMENT_ID }],
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
      // For a multi-domain tool that is the domain of the call's target: the
      // fixtures here all belong to the garden.
      const domains = toolScopes(tool(name).scope).map(
        (scope) => scope.split(":")[0]
      )
      const targetDomain = name.includes("attachment") ? ["garden"] : domains
      const scopes = MCP_SCOPES.filter(
        (scope) =>
          !targetDomain.some((domain) => scope.startsWith(`${domain}:`))
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

describe("events", () => {
  it("lists the next occurrence with the age the person turns", async () => {
    const { structured } = await callTool("list-events", {})

    expect(structured).toMatchObject({
      today: "2026-08-03",
      events: [
        {
          title: "Mormor",
          date: "1946-08-20",
          occurrence: { date: "2026-08-20", daysUntil: 17, years: 80 },
          gifts: { listCount: 1, pendingCount: 1, purchasedCount: 0 },
        },
      ],
    })
  })

  it("returns one row per occurrence in a range", async () => {
    const { structured } = await callTool("list-events", {
      from: "2026-01-01",
      to: "2027-12-31",
    })

    expect(
      (
        structured as { events: Array<{ occurrence: { date: string } }> }
      ).events.map((event) => event.occurrence.date)
    ).toEqual(["2026-08-20", "2027-08-20"])
  })

  it("rejects half a range", async () => {
    const { structured } = await callTool("list-events", { from: "2026-01-01" })

    expect(structured).toMatchObject({ error: { code: "VALIDATION_ERROR" } })
  })

  it("bounds gift lists by list visibility", async () => {
    await callTool("get-event", { eventId: EVENT_ID })

    expect(mocks.calendarEventFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EVENT_ID, householdId: "household-1" },
        include: {
          shoppingLists: expect.objectContaining({
            where: {
              householdId: "household-1",
              OR: [{ isPrivate: false }, { createdById: "user-1" }],
            },
          }),
        },
      })
    )
  })
})

describe("packing", () => {
  it("summarizes a list with the bundles on it", async () => {
    const { structured } = await callTool("get-packing-list", {
      listId: PACKING_LIST_ID,
    })

    expect(structured).toMatchObject({
      list: {
        itemCount: 2,
        packedCount: 1,
        bundles: [BUNDLE_REF],
        persons: [{ name: "Ola", itemCount: 1, packedCount: 1 }],
        departureOn: "2026-04-01",
      },
    })
  })

  it("lists only one person's things on request", async () => {
    const { structured } = await callTool("get-packing-list", {
      listId: PACKING_LIST_ID,
      personId: null,
    })

    expect(structured).toMatchObject({
      list: { itemCount: 2, items: [{ name: "Ullsokker", personId: null }] },
    })
    expect(
      (structured as { list: { items: unknown[] } }).list.items
    ).toHaveLength(1)
  })

  it("finds bundles for a season including those without a season", async () => {
    await callTool("list-packing-bundles", { season: "WINTER" })

    expect(mocks.packingBundleCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        householdId: "household-1",
        AND: [
          {
            OR: [
              { seasons: { isEmpty: true } },
              { seasons: { has: "WINTER" } },
            ],
          },
        ],
      }),
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
    ["get-event", "eventId"],
    ["get-packing-list", "listId"],
    ["get-packing-bundle", "bundleId"],
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
    await callTool("search-shopping-items", { priority: "HIGH" })

    expect(mocks.shoppingItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          list: {
            householdId: "household-1",
            OR: [{ isPrivate: false }, { createdById: "user-1" }],
          },
          priority: "HIGH",
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

  it("list-plants reports missing fields and returns full cards on request", async () => {
    const short = await callTool("list-plants", {})
    const [row] = short.structured.plants as Array<Record<string, unknown>>
    expect(row).not.toHaveProperty("careInstructions")
    expect(row?.missingFields).toEqual(
      expect.arrayContaining(["species", "soilType", "hardinessZone"])
    )
    expect(row?.missingFields).not.toContain("pruningSeason")

    const detailed = await callTool("list-plants", {
      includeDetails: true,
      limit: 100,
    })
    expect(detailed.result.isError).toBeUndefined()
    expectMatchesOutputSchema("list-plants", detailed.structured)
    const [card] = detailed.structured.plants as Array<Record<string, unknown>>
    expect(card).toMatchObject({ careInstructions: "Vann ofte" })
    // A detailed page is capped, whatever the client asked for.
    expect(mocks.plantFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 25 })
    )
  })

  it("list-plants filters on watering, toxicity and free text in the query", async () => {
    await callTool("list-plants", {
      query: "vindu",
      isToxic: false,
      notWateredSince: "2026-08-02T00:00:00Z",
    })

    expect(mocks.plantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          householdId: "household-1",
          isToxic: false,
          AND: [
            {
              OR: [
                { name: { contains: "vindu", mode: "insensitive" } },
                { species: { contains: "vindu", mode: "insensitive" } },
                {
                  placements: {
                    some: {
                      bed: { name: { contains: "vindu", mode: "insensitive" } },
                    },
                  },
                },
              ],
            },
            {
              OR: [
                { lastWateredAt: null },
                { lastWateredAt: { lt: new Date("2026-08-02T00:00:00Z") } },
              ],
            },
          ],
        }),
      })
    )
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
      project: { type: "RENOVATION", scale: "MAJOR", execution: "MIXED" },
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
          scale: "ROUTINE",
          execution: "SELF",
          stepCount: 2,
          completedStepCount: 1,
          vendorCount: 1,
          shoppingListCount: 1,
        },
      ],
    })
  })

  it("filters on scale and rejects an unknown scale", async () => {
    await callTool("list-projects", { scale: "MAJOR" })

    expect(mocks.projectCount).toHaveBeenCalledWith({
      where: { householdId: "household-1", scale: "MAJOR" },
    })

    const { structured } = await callTool("list-projects", { scale: "HUGE" })
    expect(structured).toMatchObject({ error: { code: "VALIDATION_ERROR" } })
  })
})

describe("deal tools", () => {
  it("lists only current offers on pending items the user can see", async () => {
    const { structured } = await callTool("list-shopping-deals", {})

    expect(mocks.shoppingItemDealFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            // Today in Norway, from the registry clock (2026-08-03 09:00Z).
            { validTo: { gte: new Date("2026-08-03T00:00:00.000Z") } },
            {
              validTo: null,
              reportedAt: { gte: new Date("2026-07-27T09:00:00.000Z") },
            },
          ],
          item: expect.objectContaining({
            status: "PENDING",
            list: expect.objectContaining({ householdId: "household-1" }),
          }),
        }),
      })
    )
    expect(structured).toMatchObject({
      today: "2026-08-03",
      deals: [
        {
          item: {
            name: "Stekepanne",
            watched: true,
            targetPrice: "350.00",
            plannedPrice: "299.00",
          },
          deal: { price: "349.00", savingsPercent: 41, validTo: "2026-08-09" },
        },
      ],
    })
  })

  it("lists watched pending items, least recently checked first", async () => {
    const { structured } = await callTool("list-deal-watch-items", {})

    expect(mocks.shoppingItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ dealWatch: true, status: "PENDING" }),
        orderBy: [
          { dealCheckedAt: { sort: "asc", nulls: "first" } },
          { name: "asc" },
          { id: "asc" },
        ],
      })
    )
    expect(structured).toMatchObject({
      items: [
        {
          name: "Stekepanne",
          note: "Støpejern, 28 cm",
          lastCheckedAt: null,
          currentDeal: null,
        },
      ],
    })
  })
})
