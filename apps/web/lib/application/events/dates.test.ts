import { describe, expect, it } from "vitest"

import {
  addDays,
  isValidDayOfMonth,
  nextOccurrence,
  occurrenceInYear,
  occurrencesBetween,
  osloToday,
  yearsAt,
  type EventDateParts,
} from "./dates"

const birthday: EventDateParts = {
  month: 8,
  day: 20,
  year: 1946,
  recurrence: "YEARLY",
}

describe("event dates", () => {
  it("finds this year's birthday and the age turned", () => {
    expect(nextOccurrence(birthday, "2026-08-03")).toEqual({
      date: "2026-08-20",
      daysUntil: 17,
      years: 80,
    })
  })

  it("counts today as the next occurrence", () => {
    expect(nextOccurrence(birthday, "2026-08-20")?.daysUntil).toBe(0)
  })

  it("moves to next year once the day has passed", () => {
    expect(nextOccurrence(birthday, "2026-08-21")).toMatchObject({
      date: "2027-08-20",
      years: 81,
    })
  })

  it("leaves the age out when the birth year is unknown", () => {
    expect(
      nextOccurrence({ ...birthday, year: null }, "2026-01-01")
    ).toMatchObject({ date: "2026-08-20", years: null })
  })

  it("puts 29 February on 28 February in other years", () => {
    const leapling: EventDateParts = {
      month: 2,
      day: 29,
      year: 2000,
      recurrence: "YEARLY",
    }
    expect(occurrenceInYear(leapling, 2027)).toBe("2027-02-28")
    expect(occurrenceInYear(leapling, 2028)).toBe("2028-02-29")
  })

  it("never falls before a yearly event started", () => {
    expect(occurrenceInYear(birthday, 1945)).toBeNull()
    expect(yearsAt(birthday, "1946-08-20")).toBeNull()
  })

  it("has no next occurrence for a passed one-off event", () => {
    const once: EventDateParts = {
      month: 5,
      day: 1,
      year: 2026,
      recurrence: "NONE",
    }
    expect(nextOccurrence(once, "2026-05-02")).toBeNull()
    expect(nextOccurrence(once, "2026-04-30")).toMatchObject({ daysUntil: 1 })
    expect(nextOccurrence({ ...once, year: 2030 }, "2026-01-01")).toMatchObject(
      { date: "2030-05-01", years: null }
    )
  })

  it("lists every occurrence in a range", () => {
    expect(occurrencesBetween(birthday, "2026-01-01", "2028-08-19")).toEqual([
      "2026-08-20",
      "2027-08-20",
    ])
  })

  it("validates day and month", () => {
    expect(isValidDayOfMonth(2, 29)).toBe(true)
    expect(isValidDayOfMonth(2, 30)).toBe(false)
    expect(isValidDayOfMonth(4, 31)).toBe(false)
    expect(isValidDayOfMonth(13, 1)).toBe(false)
  })

  it("adds days across a year end", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02")
  })

  it("takes today from the Norwegian calendar", () => {
    // 23:30 UTC on 31 December is already New Year's Day in Oslo.
    expect(osloToday(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01")
  })
})
