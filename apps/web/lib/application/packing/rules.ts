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
