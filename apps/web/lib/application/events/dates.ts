/*
 * Calendar arithmetic for events: when a yearly or one-off event next falls,
 * and how old someone turns. Pure and free of the database client, so client
 * components can use it too.
 *
 * Dates are calendar days as `YYYY-MM-DD` strings, never instants: a birthday
 * is the same day wherever the server runs. "Today" comes from the caller,
 * normally `osloToday()`.
 */

export type EventRecurrence = "YEARLY" | "NONE"

export type EventDateParts = {
  month: number
  day: number
  year: number | null
  recurrence: EventRecurrence
}

const osloDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Today's date in Norway as `YYYY-MM-DD`. The server runs in UTC. */
export function osloToday(now: Date = new Date()): string {
  return osloDay.format(now)
}

export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Whether a day and month exist at all (29 February counts). */
export function isValidDayOfMonth(month: number, day: number) {
  return (
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(2000, month)
  )
}

export function formatDay(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function parseDay(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 }
}

function dayNumber(value: string) {
  const { year, month, day } = parseDay(value)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string) {
  return Math.round(dayNumber(to) - dayNumber(from))
}

export function addDays(value: string, days: number) {
  const date = new Date(dayNumber(value) * 86_400_000 + days * 86_400_000)
  return formatDay(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  )
}

/**
 * The day the event falls on in `year`, or null if it does not occur that
 * year. A yearly event on 29 February falls on 28 February in other years, and
 * never before the year it started.
 */
export function occurrenceInYear(
  event: EventDateParts,
  year: number
): string | null {
  if (event.recurrence === "NONE") {
    if (event.year !== year) return null
  } else if (event.year !== null && year < event.year) {
    return null
  }

  const day =
    event.month === 2 && event.day === 29 && !isLeapYear(year) ? 28 : event.day
  return formatDay(year, event.month, day)
}

/**
 * How many years the event marks on a given occurrence: the age someone turns
 * or the anniversary number. Null when the start year is unknown, for one-off
 * events, and for the starting year itself.
 */
export function yearsAt(event: EventDateParts, occurrence: string) {
  if (event.recurrence !== "YEARLY" || event.year === null) return null
  const years = parseDay(occurrence).year - event.year
  return years > 0 ? years : null
}

export type EventOccurrence = {
  /** `YYYY-MM-DD`. */
  date: string
  daysUntil: number
  /** Age turned or anniversary number, if the start year is known. */
  years: number | null
}

/** The next time the event falls on or after `today`, or null if never again. */
export function nextOccurrence(
  event: EventDateParts,
  today: string
): EventOccurrence | null {
  const { year } = parseDay(today)

  for (const candidateYear of [year, year + 1]) {
    const date = occurrenceInYear(event, candidateYear)
    if (date && date >= today) {
      return {
        date,
        daysUntil: daysBetween(today, date),
        years: yearsAt(event, date),
      }
    }
  }

  // A one-off event further ahead than next year.
  if (event.recurrence === "NONE" && event.year !== null && event.year > year) {
    const date = occurrenceInYear(event, event.year)
    if (date) {
      return { date, daysUntil: daysBetween(today, date), years: null }
    }
  }

  return null
}

/** Every day the event falls on from `from` to `to`, both inclusive. */
export function occurrencesBetween(
  event: EventDateParts,
  from: string,
  to: string
): string[] {
  if (to < from) return []
  const first = parseDay(from).year
  const last = parseDay(to).year
  const dates: string[] = []

  for (let year = first; year <= last; year++) {
    const date = occurrenceInYear(event, year)
    if (date && date >= from && date <= to) dates.push(date)
  }

  return dates
}
