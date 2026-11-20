import { toOsloDay } from "@/lib/dashboard-stats"

/**
 * Due-date columns for the boards, in the order they are shown. Days are
 * calendar days in Norway and weeks start on Monday, so the server render and
 * the browser agree whatever time zone either runs in.
 */
export const DUE_BUCKETS = [
  "OVERDUE",
  "TODAY",
  "TOMORROW",
  "THIS_WEEK",
  "NEXT_WEEK",
  "LATER",
  "NONE",
] as const

export type DueBucket = (typeof DUE_BUCKETS)[number]

export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  OVERDUE: "Forfalt",
  TODAY: "I dag",
  TOMORROW: "I morgen",
  THIS_WEEK: "Denne uken",
  NEXT_WEEK: "Neste uke",
  LATER: "Senere",
  NONE: "Ingen frist",
}

const DAY_MS = 86_400_000

/** `YYYY-MM-DD` → days since the epoch. */
function dayNumber(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return Math.round(Date.UTC(year!, month! - 1, date!) / DAY_MS)
}

function fromDayNumber(value: number) {
  return new Date(value * DAY_MS).toISOString().slice(0, 10)
}

/** Days left in the week after `today`: 6 on a Monday, 0 on a Sunday. */
function daysLeftInWeek(today: string) {
  // 1970-01-01 was a Thursday; shift so Monday is 0.
  const weekday = (dayNumber(today) + 3) % 7
  return 6 - weekday
}

/** Today's date in Norway as `YYYY-MM-DD`. */
export function osloToday(now = new Date()) {
  return toOsloDay(now)
}

export function dueBucket(
  dueDate: string | Date | null | undefined,
  today: string
): DueBucket {
  if (!dueDate) return "NONE"

  const diff = dayNumber(toOsloDay(dueDate)) - dayNumber(today)
  const left = daysLeftInWeek(today)

  if (diff < 0) return "OVERDUE"
  if (diff === 0) return "TODAY"
  if (diff === 1) return "TOMORROW"
  if (diff <= left) return "THIS_WEEK"
  if (diff <= left + 7) return "NEXT_WEEK"
  return "LATER"
}

/**
 * The due date an item gets when it is dropped in a column: the day itself,
 * or the last day of the week. `null` clears the date. `undefined` means the
 * column takes no drops: "Forfalt" and "Senere" are not one date, and "Denne
 * uken" is already covered by today and tomorrow on a Saturday or Sunday.
 *
 * The date is noon UTC, so it is the same calendar day in Norway and in
 * `YYYY-MM-DD` form.
 */
export function dueDateForBucket(
  bucket: DueBucket,
  today: string
): Date | null | undefined {
  const base = dayNumber(today)
  const left = daysLeftInWeek(today)
  const at = (offset: number) =>
    new Date(`${fromDayNumber(base + offset)}T12:00:00.000Z`)

  switch (bucket) {
    case "TODAY":
      return at(0)
    case "TOMORROW":
      return at(1)
    case "THIS_WEEK":
      return left >= 2 ? at(left) : undefined
    case "NEXT_WEEK":
      return at(left + 7)
    case "NONE":
      return null
    case "OVERDUE":
    case "LATER":
      return undefined
  }
}

export function isDueBucketDroppable(bucket: DueBucket, today: string) {
  return dueDateForBucket(bucket, today) !== undefined
}
