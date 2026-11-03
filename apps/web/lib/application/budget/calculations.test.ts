import { describe, expect, it } from "vitest"

import { calculateBudgetOverview, calculateBudgetStats } from "./calculations"

const housingCategory = { id: "category-housing", name: "Bolig" }

const characterizedBudget = {
  taxDeductionPercent: 22,
  categories: [housingCategory],
  members: [
    { grossMonthlyIncome: 50_000, taxPercent: 30 },
    { grossMonthlyIncome: 30_000, taxPercent: 20 },
  ],
  loans: [
    {
      principalAmount: 120_000,
      annualInterestRate: 12,
      termMonths: 12,
      repaymentType: "SERIAL",
      monthlyFees: 50,
    },
  ],
  trips: [
    {
      transportType: "CAR",
      annualTrips: 12,
      ticketPerTrip: 0,
      tollPerTrip: 100,
      ferryPerTrip: 50,
      fuelPerTrip: 150,
    },
    {
      transportType: "AIR_OR_PUBLIC",
      annualTrips: 6,
      ticketPerTrip: 240,
      tollPerTrip: 999,
      ferryPerTrip: 999,
      fuelPerTrip: 999,
    },
  ],
  entries: [
    {
      id: "entry-income",
      name: "Ekstrainntekt",
      category: null,
      type: "INCOME",
      monthlyAmount: 1_000,
    },
    {
      id: "entry-housing",
      name: "Felleskostnader",
      category: housingCategory,
      type: "EXPENSE",
      monthlyAmount: 12_000,
    },
    {
      id: "entry-other",
      name: "Diverse",
      category: null,
      type: "EXPENSE",
      monthlyAmount: 800,
    },
    {
      id: "entry-deduction",
      name: "Annet fradrag",
      category: null,
      type: "DEDUCTION",
      monthlyAmount: 1_500,
    },
  ],
}

describe("calculateBudgetOverview", () => {
  it("characterizes the complete budget-view formula", () => {
    const result = calculateBudgetOverview(characterizedBudget)

    expect(result).toMatchObject({
      hasBudget: true,
      currency: "NOK",
      totalGrossIncome: 80_000,
      totalNetIncome: 59_000,
      totalLoanInterest: 650,
      totalLoanPrincipal: 10_000,
      totalLoanFees: 50,
      totalLoanCost: 10_700,
      totalTripCost: 420,
      monthlyTaxDeduction: 143,
      entryIncome: 1_000,
      entryExpenses: 12_800,
      entryDeductions: 1_500,
      totalIncome: 60_000,
      totalNonLoanExpenses: 13_220,
      totalExpenses: 23_920,
      totalDeductions: 1_643,
      disposable: 37_723,
      uncategorizedImpact: 1_700,
      memberCount: 2,
      loanCount: 1,
      tripCount: 2,
      entryCount: 4,
    })
    expect(result.categoryGroups).toEqual([
      {
        category: housingCategory,
        entries: [characterizedBudget.entries[1]],
        disposableImpact: -12_000,
      },
    ])
    expect(result.uncategorizedEntries).toEqual([
      characterizedBudget.entries[0],
      characterizedBudget.entries[2],
      characterizedBudget.entries[3],
    ])
  })

  it("returns a stable empty state when no budget exists", () => {
    expect(calculateBudgetStats(null)).toEqual({
      hasBudget: false,
      currency: "NOK",
    })
  })

  it("preserves the legacy floating-point operation order", () => {
    const result = calculateBudgetOverview({
      taxDeductionPercent: 22.15,
      categories: [],
      members: [{ grossMonthlyIncome: 54_321.67, taxPercent: 27.3 }],
      loans: [
        {
          principalAmount: 987_654.32,
          annualInterestRate: 4.75,
          termMonths: 276,
          repaymentType: "ANNUITY",
          monthlyFees: 79.9,
        },
      ],
      trips: [
        {
          transportType: "CAR",
          annualTrips: 7,
          ticketPerTrip: 0,
          tollPerTrip: 321.45,
          ferryPerTrip: 87.65,
          fuelPerTrip: 456.78,
        },
      ],
      entries: [
        { category: null, type: "INCOME", monthlyAmount: 123.45 },
        { category: null, type: "EXPENSE", monthlyAmount: 2_345.67 },
        { category: null, type: "DEDUCTION", monthlyAmount: 89.01 },
      ],
    })

    expect({
      totalNetIncome: result.totalNetIncome,
      totalLoanInterest: result.totalLoanInterest,
      totalLoanPrincipal: result.totalLoanPrincipal,
      totalLoanCost: result.totalLoanCost,
      totalTripCost: result.totalTripCost,
      monthlyTaxDeduction: result.monthlyTaxDeduction,
      totalIncome: result.totalIncome,
      totalExpenses: result.totalExpenses,
      totalDeductions: result.totalDeductions,
      disposable: result.disposable,
    }).toEqual({
      totalNetIncome: 39_491.85409,
      totalLoanInterest: 2_310.1869066439303,
      totalLoanPrincipal: 3_578.45768115942,
      totalLoanCost: 5_968.54458780335,
      totalTripCost: 505.09666666666664,
      monthlyTaxDeduction: 511.70639982163055,
      totalIncome: 39_615.30409,
      totalExpenses: 8_819.311254470016,
      totalDeductions: 600.7163998216306,
      disposable: 31_396.709235351613,
    })
  })
})
