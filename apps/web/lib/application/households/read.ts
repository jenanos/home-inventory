import { db } from "@workspace/db"

import type { ApplicationContext } from "../context"
import { notFound } from "../mutations"
import { formatDateToIsoDate } from "../serialization"

export type HouseholdSettings = {
  /** Last day of the move-in period as `YYYY-MM-DD`, or null when not set. */
  moveInPeriodEndsOn: string | null
}

export function serializeHouseholdSettings(household: {
  moveInPeriodEndsOn: Date | null
}): HouseholdSettings {
  // A `@db.Date` comes back as midnight UTC, so the UTC calendar date is the
  // stored day with no time zone shift.
  return {
    moveInPeriodEndsOn: household.moveInPeriodEndsOn
      ? formatDateToIsoDate(household.moveInPeriodEndsOn)
      : null,
  }
}

/** Household-wide settings for the caller's own household. */
export async function getHouseholdSettings(
  context: ApplicationContext
): Promise<HouseholdSettings> {
  const household = await db.household.findUnique({
    where: { id: context.householdId },
    select: { moveInPeriodEndsOn: true },
  })
  if (!household) throw notFound("husstand")

  return serializeHouseholdSettings(household)
}
