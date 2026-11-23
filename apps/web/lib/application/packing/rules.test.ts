import { describe, expect, it } from "vitest"

import { bundleFitsTrip, packingItemKey } from "./rules"

const anyTrip = { season: null, duration: null, abroad: false } as const

describe("bundleFitsTrip", () => {
  it("fits every trip when it has no conditions", () => {
    expect(
      bundleFitsTrip({ seasons: [], durations: [], abroadOnly: false }, anyTrip)
    ).toBe(true)
  })

  it("needs a matching season when limited to some", () => {
    const winter = {
      seasons: ["WINTER"] as const,
      durations: [],
      abroadOnly: false,
    }
    expect(bundleFitsTrip(winter, { ...anyTrip, season: "WINTER" })).toBe(true)
    expect(bundleFitsTrip(winter, { ...anyTrip, season: "SUMMER" })).toBe(false)
    expect(bundleFitsTrip(winter, anyTrip)).toBe(false)
  })

  it("needs a matching duration when limited to some", () => {
    const long = {
      seasons: [],
      durations: ["WEEK", "LONG"] as const,
      abroadOnly: false,
    }
    expect(bundleFitsTrip(long, { ...anyTrip, duration: "LONG" })).toBe(true)
    expect(bundleFitsTrip(long, { ...anyTrip, duration: "DAY" })).toBe(false)
  })

  it("only fits trips abroad when abroad only", () => {
    const abroad = { seasons: [], durations: [], abroadOnly: true }
    expect(bundleFitsTrip(abroad, anyTrip)).toBe(false)
    expect(bundleFitsTrip(abroad, { ...anyTrip, abroad: true })).toBe(true)
  })
})

describe("packingItemKey", () => {
  it("ignores case and extra spaces", () => {
    expect(packingItemKey("  Lade kabel ")).toBe(packingItemKey("lade  KABEL"))
  })
})
