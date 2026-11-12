import { db } from "@workspace/db"

import type { ApplicationContext } from "../context"
import { scopedWrite, validationError } from "../mutations"
import { parseCalendarDate } from "../serialization"
import { type HouseholdSettings, serializeHouseholdSettings } from "./read"

const HOUSEHOLD = "husstand"
const MOVE_IN_PERIOD_FIELD = "Slutt på innflyttingsperioden"

export type UpdateMoveInPeriodInput = {
  /** Last day of the move-in period as `YYYY-MM-DD`; `null` clears it. */
  moveInPeriodEndsOn: string | null
}

/**
 * Sets or clears the last day of the household's move-in period. The value is
 * a calendar date, stored as midnight UTC in a `@db.Date` column, so it never
 * shifts with the server's time zone. The household comes from the context,
 * so a caller can only change their own.
 */
export async function updateMoveInPeriod(
  context: ApplicationContext,
  input: UpdateMoveInPeriodInput
): Promise<HouseholdSettings> {
  const value: unknown = input.moveInPeriodEndsOn
  if (value !== null && typeof value !== "string") {
    throw validationError(
      `${MOVE_IN_PERIOD_FIELD} må være en dato (YYYY-MM-DD) eller tom.`
    )
  }

  const moveInPeriodEndsOn =
    value === null ? null : parseCalendarDate(value, MOVE_IN_PERIOD_FIELD)

  const household = await scopedWrite({
    resource: HOUSEHOLD,
    write: () =>
      db.household.update({
        where: { id: context.householdId },
        data: { moveInPeriodEndsOn },
        select: { moveInPeriodEndsOn: true },
      }),
  })

  return serializeHouseholdSettings(household)
}
