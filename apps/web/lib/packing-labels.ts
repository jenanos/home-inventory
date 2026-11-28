/*
 * Norwegian labels for packing lists and bundles. Pure data, safe for client
 * components.
 */

import type { PackingCategoryValue } from "@/lib/application/packing/categories"
import type {
  BundleConditions,
  PackingDurationValue,
  PackingSeasonValue,
} from "@/lib/application/packing/rules"

export type PackingListKindValue = "TEMPLATE" | "TRIP" | "ARCHIVED"

/** In the order of the overview tabs. */
export const PACKING_LIST_KINDS: readonly PackingListKindValue[] = [
  "TRIP",
  "TEMPLATE",
  "ARCHIVED",
]

export const KIND_LABELS: Record<PackingListKindValue, string> = {
  TRIP: "Turer",
  TEMPLATE: "Maler",
  ARCHIVED: "Historikk",
}

/** One list of the kind, for badges: "Mal", "Fullført". */
export const KIND_SINGULAR_LABELS: Record<PackingListKindValue, string> = {
  TRIP: "Tur",
  TEMPLATE: "Mal",
  ARCHIVED: "Fullført tur",
}

/** `?type=` on the overview; trips have none, since they are the default. */
export const KIND_SLUGS: Record<PackingListKindValue, string | undefined> = {
  TRIP: undefined,
  TEMPLATE: "maler",
  ARCHIVED: "historikk",
}

export function kindFromSlug(slug: string | undefined): PackingListKindValue {
  return PACKING_LIST_KINDS.find((kind) => KIND_SLUGS[kind] === slug) ?? "TRIP"
}

/** "Helg 3 · Uke 7" for a bundle item with numbers per trip length. */
export function describeQuantityByDuration(
  byDuration: Partial<Record<PackingDurationValue, number>>
) {
  return PACKING_DURATIONS.filter((duration) => byDuration[duration])
    .map(
      (duration) => `${DURATION_SHORT_LABELS[duration]} ${byDuration[duration]}`
    )
    .join(" · ")
}

export { PACKING_CATEGORIES } from "@/lib/application/packing/categories"

export const CATEGORY_LABELS: Record<PackingCategoryValue, string> = {
  CLOTHING: "Klær og sko",
  TOILETRIES: "Toalettsaker",
  HEALTH: "Medisiner og førstehjelp",
  ELECTRONICS: "Elektronikk",
  DOCUMENTS: "Dokumenter, penger og nøkler",
  KIDS: "Barn og baby",
  FOOD: "Mat og drikke",
  OUTDOOR: "Tur og sport",
  HOME: "Hjem og hytte",
  LEISURE: "Underholdning",
  OTHER: "Annet",
}

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
