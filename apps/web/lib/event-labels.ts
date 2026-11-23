import type { CalendarEventRecurrence, CalendarEventType } from "@workspace/db"

import type { EventOccurrence } from "@/lib/application/events/dates"

/**
 * Labels and badge colors for calendar events, shared by the event pages and
 * the dashboard. Mirrors the Prisma enums; pure, safe for client components.
 */

type BadgeConfig = { label: string; className: string }

export const EVENT_TYPE_CONFIG: Record<CalendarEventType, BadgeConfig> = {
  BIRTHDAY: {
    label: "Bursdag",
    className:
      "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  },
  ANNIVERSARY: {
    label: "Merkedag",
    className:
      "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  },
  HOLIDAY: {
    label: "Høytid",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
  OTHER: {
    label: "Annet",
    className:
      "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  },
}

/** Dot color in the calendar grid, one per type. */
export const EVENT_TYPE_DOT: Record<CalendarEventType, string> = {
  BIRTHDAY: "bg-pink-500",
  ANNIVERSARY: "bg-violet-500",
  HOLIDAY: "bg-amber-500",
  OTHER: "bg-gray-400",
}

export const EVENT_TYPES: CalendarEventType[] = [
  "BIRTHDAY",
  "ANNIVERSARY",
  "HOLIDAY",
  "OTHER",
]

export const EVENT_RECURRENCE_LABELS: Record<CalendarEventRecurrence, string> =
  {
    YEARLY: "Hvert år",
    NONE: "Én gang",
  }

export const MONTH_NAMES = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
] as const

/** Monday first, as Norwegian calendars are. */
export const WEEKDAY_SHORT = ["man", "tir", "ons", "tor", "fre", "lør", "søn"]

export function monthName(month: number) {
  return MONTH_NAMES[month - 1] ?? ""
}

/** "Mars 2027". */
export function monthTitle(year: number, month: number) {
  const name = monthName(month)
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`
}

/** "12. mars", or "12. mars 1950" when the year is given. */
export function formatEventDay(
  day: number,
  month: number,
  year?: number | null
) {
  return `${day}. ${monthName(month)}${year ? ` ${year}` : ""}`
}

/** A `YYYY-MM-DD` day as "12. mars 2027". */
export function formatIsoDay(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return formatEventDay(day ?? 1, month ?? 1, year)
}

/** "i dag", "i morgen", "om 12 dager". */
export function relativeDays(daysUntil: number) {
  if (daysUntil === 0) return "i dag"
  if (daysUntil === 1) return "i morgen"
  if (daysUntil < 0) return `for ${-daysUntil} dager siden`
  return `om ${daysUntil} dager`
}

/** What the occurrence marks: "fyller 40" for a birthday, "10 år" otherwise. */
export function describeYears(type: CalendarEventType, years: number | null) {
  if (years === null) return null
  return type === "BIRTHDAY" ? `fyller ${years}` : `${years} år`
}

/** "i morgen · fyller 40". */
export function describeOccurrence(
  type: CalendarEventType,
  occurrence: EventOccurrence
) {
  return [
    relativeDays(occurrence.daysUntil),
    describeYears(type, occurrence.years),
  ]
    .filter(Boolean)
    .join(" · ")
}
