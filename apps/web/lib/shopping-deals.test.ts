import { describe, expect, it } from "vitest"

import {
  dealSavingsPercent,
  describeDealPeriod,
  isAtOrBelowTarget,
} from "./shopping-deals"

describe("dealSavingsPercent", () => {
  it("rounds the discount down to whole percent", () => {
    expect(dealSavingsPercent({ price: 6990, regularPrice: 9990 })).toBe(30)
    expect(dealSavingsPercent({ price: 99, regularPrice: 100 })).toBe(1)
  })

  it("is null without a regular price or a real discount", () => {
    expect(dealSavingsPercent({ price: 100, regularPrice: null })).toBeNull()
    expect(dealSavingsPercent({ price: 100, regularPrice: 100 })).toBeNull()
    expect(dealSavingsPercent({ price: 120, regularPrice: 100 })).toBeNull()
  })
})

describe("isAtOrBelowTarget", () => {
  it("compares with the target price when there is one", () => {
    expect(isAtOrBelowTarget({ price: 500 }, 500)).toBe(true)
    expect(isAtOrBelowTarget({ price: 501 }, 500)).toBe(false)
    expect(isAtOrBelowTarget({ price: 1 }, null)).toBe(false)
  })
})

describe("describeDealPeriod", () => {
  const today = "2026-11-17"

  it("names the last day", () => {
    expect(
      describeDealPeriod({ validFrom: null, validTo: "2026-11-24" }, today)
    ).toBe("t.o.m. 24. nov.")
  })

  it("warns on the last day", () => {
    expect(
      describeDealPeriod({ validFrom: "2026-11-10", validTo: today }, today)
    ).toBe("siste dag i dag")
  })

  it("shows the whole period of an offer that has not started", () => {
    expect(
      describeDealPeriod(
        { validFrom: "2026-11-20", validTo: "2026-11-30" },
        today
      )
    ).toBe("20. nov. – 30. nov.")
    expect(
      describeDealPeriod({ validFrom: "2026-11-20", validTo: null }, today)
    ).toBe("fra 20. nov.")
  })

  it("says nothing when the store gave no dates", () => {
    expect(describeDealPeriod({ validFrom: null, validTo: null }, today)).toBe(
      null
    )
  })
})
