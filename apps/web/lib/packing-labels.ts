/*
 * Norwegian labels for packing lists and bundles. Pure data, safe for client
 * components.
 */

import type {
  BundleConditions,
  PackingDurationValue,
  PackingSeasonValue,
} from "@/lib/application/packing/rules"

export const PACKING_SEASONS: readonly PackingSeasonValue[] = [
  "SPRING",
  "SUMMER",
  "AUTUMN",
  "WINTER",
]

export const PACKING_DURATIONS: readonly PackingDurationValue[] = [
  "DAY",
  "WEEKEND",
  "WEEK",
  "LONG",
]

export const SEASON_LABELS: Record<PackingSeasonValue, string> = {
  SPRING: "Vår",
  SUMMER: "Sommer",
  AUTUMN: "Høst",
  WINTER: "Vinter",
}

export const DURATION_LABELS: Record<PackingDurationValue, string> = {
  DAY: "Dagstur",
  WEEKEND: "Helg (1–3 netter)",
  WEEK: "Uke (4–8 netter)",
  LONG: "Lengre tur",
}

/** For badges and chips, where the night count does not fit. */
export const DURATION_SHORT_LABELS: Record<PackingDurationValue, string> = {
  DAY: "Dagstur",
  WEEKEND: "Helg",
  WEEK: "Uke",
  LONG: "Lengre tur",
}

export function isPackingSeason(value: unknown): value is PackingSeasonValue {
  return (PACKING_SEASONS as readonly unknown[]).includes(value)
}

export function isPackingDuration(
  value: unknown
): value is PackingDurationValue {
  return (PACKING_DURATIONS as readonly unknown[]).includes(value)
}

/** "Vinter · Helg, Uke · Utenlands", or "Alltid" for a bundle with no limits. */
export function describeBundleConditions(bundle: BundleConditions) {
  const parts: string[] = []
  if (bundle.seasons.length > 0) {
    parts.push(bundle.seasons.map((season) => SEASON_LABELS[season]).join(", "))
  }
  if (bundle.durations.length > 0) {
    parts.push(
      bundle.durations
        .map((duration) => DURATION_SHORT_LABELS[duration])
        .join(", ")
    )
  }
  if (bundle.abroadOnly) parts.push("Utenlands")
  return parts.length > 0 ? parts.join(" · ") : "Alltid"
}

const departureFormatter = new Intl.DateTimeFormat("nb-NO", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  // A calendar date is stored as midnight UTC.
  timeZone: "UTC",
})

export function formatDeparture(date: Date | string) {
  return departureFormatter.format(new Date(date))
}

/** `YYYY-MM-DD` for a date input, from a stored calendar date. */
export function toDateInputValue(date: Date | string | null | undefined) {
  return date ? new Date(date).toISOString().slice(0, 10) : ""
}

// ─── URL filters ────────────────────────────────────────────────

/** Norwegian slugs for `?sesong=` and `?varighet=`. */
export const SEASON_SLUGS: Record<PackingSeasonValue, string> = {
  SPRING: "var",
  SUMMER: "sommer",
  AUTUMN: "host",
  WINTER: "vinter",
}

export const DURATION_SLUGS: Record<PackingDurationValue, string> = {
  DAY: "dag",
  WEEKEND: "helg",
  WEEK: "uke",
  LONG: "lang",
}

export function seasonFromSlug(slug: string | undefined) {
  return PACKING_SEASONS.find((season) => SEASON_SLUGS[season] === slug)
}

export function durationFromSlug(slug: string | undefined) {
  return PACKING_DURATIONS.find((duration) => DURATION_SLUGS[duration] === slug)
}
