/*
 * When a packing bundle fits a trip. Pure, so the web page can suggest bundles
 * with the same rule the write service uses to add them automatically.
 */

export type PackingSeasonValue = "SPRING" | "SUMMER" | "AUTUMN" | "WINTER"
export type PackingDurationValue = "DAY" | "WEEKEND" | "WEEK" | "LONG"

export type TripProfile = {
  season: PackingSeasonValue | null
  duration: PackingDurationValue | null
  abroad: boolean
}

export type BundleConditions = {
  seasons: readonly PackingSeasonValue[]
  durations: readonly PackingDurationValue[]
  abroadOnly: boolean
}

/**
 * An empty season or duration list means "any". A bundle limited to some
 * seasons does not fit a trip without a season, since nothing says it applies.
 */
export function bundleFitsTrip(bundle: BundleConditions, trip: TripProfile) {
  const seasonFits =
    bundle.seasons.length === 0 ||
    (trip.season !== null && bundle.seasons.includes(trip.season))
  const durationFits =
    bundle.durations.length === 0 ||
    (trip.duration !== null && bundle.durations.includes(trip.duration))
  const abroadFits = !bundle.abroadOnly || trip.abroad

  return seasonFits && durationFits && abroadFits
}

/** Case- and whitespace-insensitive key for spotting the same thing twice. */
export function packingItemKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("nb-NO")
}

/** A bundle item's quantity, with an optional own number per trip length. */
export type DurationQuantities = {
  quantity: number
  quantityDay: number | null
  quantityWeekend: number | null
  quantityWeek: number | null
  quantityLong: number | null
}

export const DURATION_QUANTITY_FIELD = {
  DAY: "quantityDay",
  WEEKEND: "quantityWeekend",
  WEEK: "quantityWeek",
  LONG: "quantityLong",
} as const satisfies Record<PackingDurationValue, keyof DurationQuantities>

/**
 * How many to pack for a trip: the number set for its length ("3 boksere til
 * helg, 7 til uke"), or the item's plain quantity when the length has none or
 * the trip has no length.
 */
export function quantityForTrip(
  item: DurationQuantities,
  duration: PackingDurationValue | null
) {
  if (duration === null) return item.quantity
  return item[DURATION_QUANTITY_FIELD[duration]] ?? item.quantity
}

/** True when the item packs a different number for some trip length. */
export function hasDurationQuantities(item: DurationQuantities) {
  return Object.values(DURATION_QUANTITY_FIELD).some(
    (field) => item[field] !== null && item[field] !== item.quantity
  )
}

/** The lengths with their own number, keyed by duration. */
export function quantityByDurationOf(item: DurationQuantities) {
  const result: Partial<Record<PackingDurationValue, number>> = {}
  for (const [duration, field] of Object.entries(DURATION_QUANTITY_FIELD)) {
    const count = item[field]
    if (count !== null) result[duration as PackingDurationValue] = count
  }
  return result
}
