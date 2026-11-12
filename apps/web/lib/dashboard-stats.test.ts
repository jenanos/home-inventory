import { describe, expect, it } from "vitest"

import {
  calculateBudgetStats,
  calculateProjectStats,
  calculateShoppingStats,
} from "./dashboard-stats"

describe("calculateShoppingStats", () => {
  const now = new Date("2026-11-12T12:00:00Z")
  const items = [
    {
      status: "PENDING",
      estimatedPrice: "100",
      alternatives: [],
      timeframe: "NOW",
      priority: "HIGH",
      category: { name: "Kjøkken" },
    },
    {
      // The preferred alternative wins over the item's own estimate, as on
      // the list page.
      status: "PENDING",
      estimatedPrice: "999",
      alternatives: [{ price: "25" }],
      timeframe: null,
      priority: "LOW",
    },
    {
      status: "PENDING",
      alternatives: [],
      timeframe: "SOMEDAY",
      priority: "LOW",
    },
    {
      status: "PURCHASED",
      alternatives: [{ price: "500" }],
      // 23:30 UTC on 31 July is 1 August in Oslo: after the move-in period.
      purchasedAt: "2026-07-31T23:30:00Z",
      category: { name: "Kjøkken" },
    },
    {
      status: "PURCHASED",
      estimatedPrice: "2000",
      alternatives: [],
      purchasedAt: "2026-06-15T10:00:00Z",
    },
    {
      status: "PURCHASED",
      estimatedPrice: "40",
      alternatives: [],
      purchasedAt: "2026-11-01T10:00:00Z",
    },
    { status: "PURCHASED", estimatedPrice: "7", alternatives: [] },
    { status: "SKIPPED", estimatedPrice: "999", alternatives: [] },
  ]

  it("splits remaining items by timeframe, priority and category", () => {
    const stats = calculateShoppingStats(items, { now })

    expect(stats.totalItems).toBe(8)
    expect(stats.skippedCount).toBe(1)
    expect(stats.remaining).toEqual({ count: 3, total: 125, unpriced: 1 })
    expect(stats.purchased).toEqual({ count: 4, total: 2547, unpriced: 0 })
    expect(stats.remainingByTimeframe).toEqual({
      NOW: { count: 1, total: 100, unpriced: 0 },
      SOON: { count: 0, total: 0, unpriced: 0 },
      LATER: { count: 0, total: 0, unpriced: 0 },
      SOMEDAY: { count: 1, total: 0, unpriced: 1 },
      UNSET: { count: 1, total: 25, unpriced: 0 },
    })
    expect(stats.remainingByPriority).toEqual({
      HIGH: { count: 1, total: 100, unpriced: 0 },
      MEDIUM: { count: 0, total: 0, unpriced: 0 },
      LOW: { count: 2, total: 25, unpriced: 1 },
    })
    expect(stats.remainingByCategory).toEqual([
      { name: "Kjøkken", count: 1, total: 100, unpriced: 0 },
      { name: "Uten kategori", count: 2, total: 25, unpriced: 1 },
    ])
  })

  it("leaves the move-in split out until a period is set", () => {
    const stats = calculateShoppingStats(items, { now })

    expect(stats.purchasedByPeriod).toBeNull()
    expect(stats.purchasesByMonth.every((month) => !month.inMoveIn)).toBe(true)
  })

  it("splits purchases on the move-in period in Oslo time", () => {
    const stats = calculateShoppingStats(items, {
      now,
      moveInPeriodEndsOn: "2026-07-31",
    })

    expect(stats.purchasedByPeriod).toEqual({
      moveIn: { count: 1, total: 2000, unpriced: 0 },
      afterMoveIn: { count: 2, total: 540, unpriced: 0 },
      undated: { count: 1, total: 7, unpriced: 0 },
    })
    expect(stats.purchasedLast30Days).toEqual({
      count: 1,
      total: 40,
      unpriced: 0,
    })
  })

  it("lists every month from the first purchase, including quiet ones", () => {
    const stats = calculateShoppingStats(items, {
      now,
      moveInPeriodEndsOn: "2026-07-31",
    })

    expect(stats.purchasesByMonth).toEqual([
      { month: "2026-06", count: 1, total: 2000, inMoveIn: true },
      { month: "2026-07", count: 0, total: 0, inMoveIn: true },
      { month: "2026-08", count: 1, total: 500, inMoveIn: false },
      { month: "2026-09", count: 0, total: 0, inMoveIn: false },
      { month: "2026-10", count: 0, total: 0, inMoveIn: false },
      { month: "2026-11", count: 1, total: 40, inMoveIn: false },
    ])
  })

  it("sums purchases older than the history window separately", () => {
    const stats = calculateShoppingStats(items, { now, historyMonths: 4 })

    expect(stats.purchasesByMonth.map((month) => month.month)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ])
    expect(stats.purchasesBeforeHistory).toEqual({ count: 1, total: 2000 })
  })
})

describe("calculateBudgetStats", () => {
  it("returns a disabled state when no budget exists", () => {
    expect(calculateBudgetStats(null)).toEqual({
      hasBudget: false,
      currency: "NOK",
    })
  })

  it("delegates dashboard totals to the complete budget calculation", () => {
    const stats = calculateBudgetStats({
      taxDeductionPercent: "22",
      categories: [],
      members: [
        { grossMonthlyIncome: "50000", taxPercent: "30" },
        { grossMonthlyIncome: "30000", taxPercent: "20" },
      ],
      loans: [
        {
          principalAmount: "1200000",
          annualInterestRate: "0",
          termMonths: "240",
          repaymentType: "ANNUITY",
          monthlyFees: "100",
        },
      ],
      trips: [],
      entries: [
        { type: "EXPENSE", amount: "12000", category: null },
        { type: "DEDUCTION", amount: "1500", category: null },
        { type: "EXPENSE", amount: "800", category: null },
      ],
    })

    expect(stats).toMatchObject({
      hasBudget: true,
      currency: "NOK",
      totalGrossIncome: 80000,
      totalNetIncome: 59000,
      totalLoanPayments: 5100,
      totalExpenses: 17900,
      totalDeductions: 1500,
      disposable: 42600,
      memberCount: 2,
      loanCount: 1,
      entryCount: 3,
    })
  })
})

describe("calculateProjectStats", () => {
  it("counts only active projects as remaining and keeps on-hold apart", () => {
    const now = new Date("2026-04-24T20:09:39.325Z")
    const tasks = [
      {
        status: "NOT_STARTED",
        priority: "HIGH",
        scale: "MAJOR",
        estimatedPrice: "1000",
        dueDate: "2026-04-20T00:00:00.000Z",
      },
      {
        status: "IN_PROGRESS",
        priority: "LOW",
        scale: "ROUTINE",
        estimatedPrice: "250",
        dueDate: "2026-05-01T00:00:00.000Z",
      },
      {
        status: "IN_PROGRESS",
        priority: "LOW",
        scale: "ROUTINE",
        estimatedPrice: null,
      },
      {
        status: "COMPLETED",
        priority: "HIGH",
        estimatedPrice: "300",
        dueDate: "2026-04-01T00:00:00.000Z",
      },
      {
        // Parked and overdue: neither remaining nor overdue.
        status: "ON_HOLD",
        priority: "HIGH",
        scale: "MAJOR",
        estimatedPrice: "80000",
        dueDate: "2026-01-01T00:00:00.000Z",
      },
    ]

    const stats = calculateProjectStats(tasks, now)

    expect(stats.totalProjects).toBe(5)
    expect(stats.notStartedCount).toBe(1)
    expect(stats.inProgressCount).toBe(2)
    expect(stats.completedCount).toBe(1)
    expect(stats.onHoldCount).toBe(1)
    expect(stats.remaining).toEqual({ count: 3, total: 1250, unpriced: 1 })
    expect(stats.completed).toEqual({ count: 1, total: 300, unpriced: 0 })
    expect(stats.onHold).toEqual({ count: 1, total: 80000, unpriced: 0 })
    expect(stats.remainingByPriority).toEqual({
      HIGH: { count: 1, total: 1000, unpriced: 0 },
      MEDIUM: { count: 0, total: 0, unpriced: 0 },
      LOW: { count: 2, total: 250, unpriced: 1 },
    })
    expect(stats.remainingByScale).toEqual({
      ROUTINE: { count: 2, total: 250, unpriced: 1 },
      MAJOR: { count: 1, total: 1000, unpriced: 0 },
    })
    expect(stats.countByScale).toEqual({ ROUTINE: 3, MAJOR: 2 })
    expect(stats.highPriorityProjects).toEqual([tasks[0]])
    expect(stats.overdueProjects).toEqual([tasks[0]])
  })
})
