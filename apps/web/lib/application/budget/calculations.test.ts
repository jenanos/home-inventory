import { describe, expect, it } from "vitest"

import { BudgetFrequency } from "@workspace/db"

import { calculateLoanMonthlyAmounts } from "../../budget-loan"
import {
  BUDGET_FREQUENCIES,
  calculateBudgetOverview,
  calculateBudgetStats,
  entryMonthlyAmount,
  memberNetIncome,
  tripMonthlyCost,
} from "./calculations"

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
      amount: 1_000,
    },
    {
      id: "entry-housing",
      name: "Felleskostnader",
      category: housingCategory,
      type: "EXPENSE",
      amount: 12_000,
    },
    {
      id: "entry-other",
      name: "Diverse",
      category: null,
      type: "EXPENSE",
      amount: 800,
    },
    {
      id: "entry-deduction",
      name: "Annet fradrag",
      category: null,
      type: "DEDUCTION",
      amount: 1_500,
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

  it("treats entries as monthly when no frequency is given", () => {
    const result = calculateBudgetOverview(characterizedBudget)
    expect(result.entryExpenses).toBe(12_800)
  })
})

const emptyBudget = {
  taxDeductionPercent: 22,
  categories: [],
  members: [],
  loans: [],
  trips: [],
  entries: [],
}

describe("entry frequency", () => {
  it("lists exactly the Prisma enum", () => {
    expect([...BUDGET_FREQUENCIES].sort()).toEqual(
      Object.values(BudgetFrequency).sort()
    )
  })

  it.each([
    ["WEEKLY", 120, 520],
    ["MONTHLY", 1_000, 1_000],
    ["QUARTERLY", 3_000, 1_000],
    ["SEMIANNUAL", 6_000, 1_000],
    ["YEARLY", 12_000, 1_000],
  ])(
    "converts %s amounts to a monthly figure",
    (frequency, amount, monthly) => {
      expect(entryMonthlyAmount({ amount, frequency })).toBeCloseTo(monthly, 10)
    }
  )

  it("uses the monthly figure in every total", () => {
    const result = calculateBudgetOverview({
      ...emptyBudget,
      entries: [
        {
          type: "EXPENSE",
          amount: 13_200,
          frequency: "YEARLY",
          category: null,
        },
        {
          type: "INCOME",
          amount: 3_000,
          frequency: "QUARTERLY",
          category: null,
        },
      ],
    })

    expect(result.entryExpenses).toBe(1_100)
    expect(result.entryIncome).toBe(1_000)
    expect(result.disposable).toBe(-100)
    expect(result.uncategorizedImpact).toBe(-100)
  })
})

describe("savings", () => {
  it("lowers the disposable amount without counting as an expense", () => {
    const result = calculateBudgetOverview({
      ...emptyBudget,
      members: [{ grossMonthlyIncome: 50_000, taxPercent: 30 }],
      entries: [
        { type: "SAVINGS", amount: 3_500, category: null },
        { type: "EXPENSE", amount: 10_000, category: null },
      ],
    })

    expect(result.totalSavings).toBe(3_500)
    expect(result.totalExpenses).toBe(10_000)
    expect(result.disposable).toBe(35_000 - 10_000 - 3_500)
    expect(result.savingsRate).toBeCloseTo(10, 10)
  })

  it("counts loan principal as saving in the savings rate", () => {
    const result = calculateBudgetOverview({
      ...emptyBudget,
      members: [{ grossMonthlyIncome: 50_000, taxPercent: 20 }],
      loans: [
        {
          principalAmount: 1_200_000,
          annualInterestRate: 0,
          termMonths: 240,
          repaymentType: "SERIAL",
          monthlyFees: 0,
        },
      ],
      entries: [{ type: "SAVINGS", amount: 1_000, category: null }],
    })

    expect(result.savingsIncludingPrincipal).toBe(6_000)
    expect(result.savingsRate).toBeCloseTo(15, 10)
  })

  it("has no savings rate without income", () => {
    expect(calculateBudgetOverview(emptyBudget).savingsRate).toBeNull()
  })
})

describe("member net income", () => {
  it("uses the actual payout when it is set", () => {
    expect(
      memberNetIncome({
        grossMonthlyIncome: 60_000,
        taxPercent: 35,
        netMonthlyIncome: 41_234,
      })
    ).toBe(41_234)
    expect(
      memberNetIncome({
        grossMonthlyIncome: 60_000,
        taxPercent: 35,
        netMonthlyIncome: null,
      })
    ).toBe(39_000)
  })

  it("keeps gross income for the debt ratio", () => {
    const result = calculateBudgetOverview({
      ...emptyBudget,
      members: [
        {
          grossMonthlyIncome: 50_000,
          taxPercent: 30,
          netMonthlyIncome: 30_000,
        },
      ],
    })

    expect(result.totalGrossIncome).toBe(50_000)
    expect(result.totalNetIncome).toBe(30_000)
  })
})

describe("loan calculation", () => {
  it("splits an annuity from today's balance, averaged over the next year", () => {
    const amounts = calculateLoanMonthlyAmounts({
      principalAmount: 3_000_000,
      annualInterestRate: 6,
      termMonths: 300,
      repaymentType: "ANNUITY",
    })
    const payment = (3_000_000 * 0.005) / (1 - Math.pow(1.005, -300))

    expect(amounts.firstPayment).toBeCloseTo(payment, 6)
    expect(amounts.monthlyPayment).toBeCloseTo(payment, 6)
    // First month's interest is 15 000 and it falls slowly as the debt shrinks.
    expect(amounts.monthlyInterest).toBeLessThan(15_000)
    expect(amounts.monthlyInterest).toBeGreaterThan(14_800)
    expect(amounts.monthlyInterest + amounts.monthlyPrincipal).toBeCloseTo(
      payment,
      6
    )
    expect(amounts.remainingInterest).toBeCloseTo(payment * 300 - 3_000_000, 2)
  })

  it("splits a serial loan from today's balance", () => {
    const amounts = calculateLoanMonthlyAmounts({
      principalAmount: 1_200_000,
      annualInterestRate: 6,
      termMonths: 120,
      repaymentType: "SERIAL",
    })

    expect(amounts.monthlyPrincipal).toBeCloseTo(10_000, 6)
    expect(amounts.firstPayment).toBeCloseTo(16_000, 6)
    // 0.5 % of 1.2M, 1.19M … 1.09M, divided by 12.
    expect(amounts.monthlyInterest).toBeCloseTo(5_725, 6)
    expect(amounts.remainingInterest).toBeCloseTo(363_000, 4)
  })

  it("averages over the remaining months when less than a year is left", () => {
    const amounts = calculateLoanMonthlyAmounts({
      principalAmount: 60_000,
      annualInterestRate: 0,
      termMonths: 6,
      repaymentType: "ANNUITY",
    })

    expect(amounts.monthlyPrincipal).toBeCloseTo(10_000, 6)
    expect(amounts.monthlyInterest).toBe(0)
  })

  it("returns zeros for a loan that is not set up", () => {
    expect(
      calculateLoanMonthlyAmounts({
        principalAmount: 0,
        annualInterestRate: 5,
        termMonths: 0,
        repaymentType: "ANNUITY",
      })
    ).toEqual({
      monthlyInterest: 0,
      monthlyPrincipal: 0,
      monthlyPayment: 0,
      firstPayment: 0,
      remainingInterest: 0,
    })
  })

  it("bases the interest deduction on the year's interest", () => {
    const result = calculateBudgetOverview({
      ...emptyBudget,
      loans: [
        {
          principalAmount: 1_200_000,
          annualInterestRate: 6,
          termMonths: 120,
          repaymentType: "SERIAL",
          monthlyFees: 0,
        },
      ],
    })

    expect(result.monthlyTaxDeduction).toBeCloseTo(5_725 * 0.22, 6)
  })
})

describe("key figures", () => {
  const loan = {
    principalAmount: 2_400_000,
    annualInterestRate: 5,
    termMonths: 300,
    repaymentType: "ANNUITY",
    monthlyFees: 0,
  }

  it("relates total debt to gross yearly income", () => {
    const result = calculateBudgetOverview({
      ...emptyBudget,
      members: [{ grossMonthlyIncome: 50_000, taxPercent: 30 }],
      loans: [loan, { ...loan, loanType: "CAR", principalAmount: 600_000 }],
    })

    expect(result.totalDebt).toBe(3_000_000)
    expect(result.debtToIncomeRatio).toBe(5)
  })

  it("relates only mortgages to the property value", () => {
    const result = calculateBudgetOverview({
      ...emptyBudget,
      propertyValue: 4_000_000,
      loans: [
        { ...loan, loanType: "MORTGAGE" },
        { ...loan, loanType: "STUDENT", principalAmount: 300_000 },
      ],
    })

    expect(result.mortgageDebt).toBe(2_400_000)
    expect(result.loanToValue).toBe(60)
  })

  it("leaves a ratio null when its input is missing", () => {
    const result = calculateBudgetOverview({ ...emptyBudget, loans: [loan] })

    expect(result.debtToIncomeRatio).toBeNull()
    expect(result.loanToValue).toBeNull()
  })
})

describe("trip cost", () => {
  it("adds other costs to every transport type", () => {
    const base = {
      annualTrips: 6,
      ticketPerTrip: 1_000,
      tollPerTrip: 100,
      ferryPerTrip: 0,
      fuelPerTrip: 300,
      otherPerTrip: 200,
    }

    expect(tripMonthlyCost({ ...base, transportType: "AIR_OR_PUBLIC" })).toBe(
      600
    )
    expect(tripMonthlyCost({ ...base, transportType: "CAR" })).toBe(300)
  })
})
