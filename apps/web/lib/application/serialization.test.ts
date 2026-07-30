import { describe, expect, it } from "vitest"

import { ApplicationError } from "./errors"
import {
  formatDateToIsoDate,
  parseCalendarDate,
  serializeCalculatedMoney,
  serializeDecimal,
  serializeEnum,
  serializeTimestamp,
} from "./serialization"

describe("calendar date serialization", () => {
  it.each(["2026-03-29", "2026-10-25"])(
    "keeps %s at UTC midnight across Oslo daylight-saving boundaries",
    (value) => {
      const date = parseCalendarDate(value)

      expect(date.toISOString()).toBe(`${value}T00:00:00.000Z`)
      expect(formatDateToIsoDate(date)).toBe(value)
    }
  )

  it.each(["2026-02-29", "2026-13-01", "30.07.2026", ""])(
    "rejects invalid calendar date %j",
    (value) => {
      expect(() => parseCalendarDate(value)).toThrow(ApplicationError)
    }
  )

  it("serializes timestamps as UTC ISO 8601", () => {
    expect(serializeTimestamp(new Date("2026-07-30T12:34:56+02:00"))).toBe(
      "2026-07-30T10:34:56.000Z"
    )
  })
})

describe("money and enum serialization", () => {
  it("preserves a stored decimal's own string representation", () => {
    expect(serializeDecimal({ toString: () => "123456789.10" })).toBe(
      "123456789.10"
    )
    expect(serializeDecimal(null)).toBeNull()
  })

  it("formats float-derived aggregates with two decimal places", () => {
    expect(serializeCalculatedMoney(0.1 + 0.2)).toBe("0.30")
    expect(serializeCalculatedMoney(12)).toBe("12.00")
  })

  it("keeps enum values unchanged and typed", () => {
    expect(serializeEnum("IN_PROGRESS")).toBe("IN_PROGRESS")
  })
})
