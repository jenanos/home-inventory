import { describe, expect, it } from "vitest"

import { dueBucket, dueDateForBucket, osloToday } from "./due-date"

// 2026-11-18 is a Wednesday.
const WEDNESDAY = "2026-11-18"
const SATURDAY = "2026-11-21"
const SUNDAY = "2026-11-22"

describe("dueBucket", () => {
  it("places dates relative to today, with Monday-start weeks", () => {
    expect(dueBucket(null, WEDNESDAY)).toBe("NONE")
    expect(dueBucket("2026-11-17T12:00:00Z", WEDNESDAY)).toBe("OVERDUE")
    expect(dueBucket("2026-11-18T12:00:00Z", WEDNESDAY)).toBe("TODAY")
    expect(dueBucket("2026-11-19T12:00:00Z", WEDNESDAY)).toBe("TOMORROW")
    expect(dueBucket("2026-11-22T12:00:00Z", WEDNESDAY)).toBe("THIS_WEEK")
    expect(dueBucket("2026-11-23T12:00:00Z", WEDNESDAY)).toBe("NEXT_WEEK")
    expect(dueBucket("2026-11-29T12:00:00Z", WEDNESDAY)).toBe("NEXT_WEEK")
    expect(dueBucket("2026-11-30T12:00:00Z", WEDNESDAY)).toBe("LATER")
  })

  it("reads the day as the calendar in Norway shows it", () => {
    // Local midnight in Oslo, as the date picker stores it, is the previous
    // day in UTC.
    expect(dueBucket("2026-11-17T23:00:00Z", WEDNESDAY)).toBe("TODAY")
  })

  it("has no days left this week on a Sunday", () => {
    expect(dueBucket("2026-11-23T12:00:00Z", SUNDAY)).toBe("TOMORROW")
    expect(dueBucket("2026-11-24T12:00:00Z", SUNDAY)).toBe("NEXT_WEEK")
  })
})

describe("dueDateForBucket", () => {
  it("gives the day itself or the last day of the week, at noon UTC", () => {
    const iso = (bucket: Parameters<typeof dueDateForBucket>[0]) =>
      dueDateForBucket(bucket, WEDNESDAY)?.toISOString()

    expect(iso("TODAY")).toBe("2026-11-18T12:00:00.000Z")
    expect(iso("TOMORROW")).toBe("2026-11-19T12:00:00.000Z")
    expect(iso("THIS_WEEK")).toBe("2026-11-22T12:00:00.000Z")
    expect(iso("NEXT_WEEK")).toBe("2026-11-29T12:00:00.000Z")
    expect(dueDateForBucket("NONE", WEDNESDAY)).toBeNull()
  })

  it("lands every droppable date back in its own column", () => {
    for (const today of [WEDNESDAY, SATURDAY, SUNDAY, "2026-11-16"]) {
      for (const bucket of [
        "TODAY",
        "TOMORROW",
        "THIS_WEEK",
        "NEXT_WEEK",
      ] as const) {
        const date = dueDateForBucket(bucket, today)
        if (date) expect(dueBucket(date, today)).toBe(bucket)
      }
    }
  })

  it("takes no drops in columns that are not one date", () => {
    expect(dueDateForBucket("OVERDUE", WEDNESDAY)).toBeUndefined()
    expect(dueDateForBucket("LATER", WEDNESDAY)).toBeUndefined()
    // Saturday: the rest of the week is today and tomorrow.
    expect(dueDateForBucket("THIS_WEEK", SATURDAY)).toBeUndefined()
    expect(dueDateForBucket("THIS_WEEK", SUNDAY)).toBeUndefined()
  })
})

describe("osloToday", () => {
  it("uses the date in Norway, not UTC", () => {
    expect(osloToday(new Date("2026-11-18T23:30:00Z"))).toBe("2026-11-19")
  })
})
