import { describe, expect, it } from "vitest"

import {
  calculateBudgetStats,
  calculateMaintenanceStats,
  calculateShoppingStats,
} from "./dashboard-stats"

describe("calculateShoppingStats", () => {
  it("summarizes items, timeframes, and assignees", () => {
    const stats = calculateShoppingStats([
      {
        status: "PENDING",
        estimatedPrice: "100",
        alternatives: [],
        timeframe: "NOW",
        assignedTo: { name: "Ada" },
      },
      {
        status: "PENDING",
        alternatives: [{ price: "25" }],
        timeframe: null,
        assignedTo: null,
      },
      {
        status: "PURCHASED",
        alternatives: [{ price: "50" }],
      },
      {
        status: "SKIPPED",
        estimatedPrice: "999",
        alternatives: [],
      },
    ])

    expect(stats).toEqual({
      totalItems: 4,
      pendingCount: 2,
      purchasedCount: 1,
      totalEstimated: 175,
      purchasedTotal: 50,
      itemsByTimeframe: {
        NOW: 1,
        SOON: 0,
        LATER: 0,
        SOMEDAY: 0,
        UNSET: 1,
      },
      itemsByPerson: {
        Ada: 1,
        "Ikke tildelt": 1,
      },
    })
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
        { type: "EXPENSE", monthlyAmount: "12000", category: null },
        { type: "DEDUCTION", monthlyAmount: "1500", category: null },
        { type: "EXPENSE", monthlyAmount: "800", category: null },
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

describe("calculateMaintenanceStats", () => {
  it("tracks status, cost, and overdue/high-priority tasks", () => {
    const now = new Date("2026-04-24T20:09:39.325Z")
    const tasks = [
      {
        status: "NOT_STARTED",
        priority: "HIGH",
        estimatedPrice: "1000",
        dueDate: "2026-04-20T00:00:00.000Z",
      },
      {
        status: "IN_PROGRESS",
        priority: "LOW",
        estimatedPrice: "250",
        dueDate: "2026-05-01T00:00:00.000Z",
      },
      {
        status: "COMPLETED",
        priority: "HIGH",
        estimatedPrice: "300",
        dueDate: "2026-04-01T00:00:00.000Z",
      },
      {
        status: "ON_HOLD",
        estimatedPrice: null,
      },
    ]

    const stats = calculateMaintenanceStats(tasks, now)

    expect(stats.totalTasks).toBe(4)
    expect(stats.notStartedCount).toBe(1)
    expect(stats.inProgressCount).toBe(1)
    expect(stats.completedCount).toBe(1)
    expect(stats.onHoldCount).toBe(1)
    expect(stats.totalEstimatedCost).toBe(1550)
    expect(stats.highPriorityTasks).toEqual([tasks[0]])
    expect(stats.overdueTasks).toEqual([tasks[0]])
  })
})
