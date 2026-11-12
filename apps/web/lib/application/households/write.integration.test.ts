import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createHouseholdFixtures } from "../../test/household-fixtures"
import { getHouseholdSettings } from "./read"
import { updateMoveInPeriod } from "./write"

const fixtures = createHouseholdFixtures()

afterAll(async () => {
  await fixtures.cleanup()
  await db.$disconnect()
})

describe("household move-in period", () => {
  it("is unset for a new household", async () => {
    const { context } = await fixtures.createHousehold()

    await expect(getHouseholdSettings(context)).resolves.toEqual({
      moveInPeriodEndsOn: null,
    })
  })

  it("stores the calendar date without shifting it and clears it with null", async () => {
    const { context, householdId } = await fixtures.createHousehold()

    await expect(
      updateMoveInPeriod(context, { moveInPeriodEndsOn: "2026-12-31" })
    ).resolves.toEqual({ moveInPeriodEndsOn: "2026-12-31" })
    await expect(getHouseholdSettings(context)).resolves.toEqual({
      moveInPeriodEndsOn: "2026-12-31",
    })

    const stored = await db.household.findUniqueOrThrow({
      where: { id: householdId },
      select: { moveInPeriodEndsOn: true },
    })
    expect(stored.moveInPeriodEndsOn?.toISOString()).toBe(
      "2026-12-31T00:00:00.000Z"
    )

    await expect(
      updateMoveInPeriod(context, { moveInPeriodEndsOn: null })
    ).resolves.toEqual({ moveInPeriodEndsOn: null })
    await expect(getHouseholdSettings(context)).resolves.toEqual({
      moveInPeriodEndsOn: null,
    })
  })

  it.each([
    ["not a date", "snart"],
    ["a timestamp", "2026-12-31T00:00:00Z"],
    ["an impossible day", "2026-02-30"],
    ["an empty string", ""],
    ["a non-string", 20261231 as never],
  ])(
    "rejects %s with VALIDATION_ERROR and keeps the old value",
    async (_label, value) => {
      const { context } = await fixtures.createHousehold()
      await updateMoveInPeriod(context, { moveInPeriodEndsOn: "2026-08-01" })

      await expect(
        updateMoveInPeriod(context, { moveInPeriodEndsOn: value })
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
      await expect(getHouseholdSettings(context)).resolves.toEqual({
        moveInPeriodEndsOn: "2026-08-01",
      })
    }
  )

  it("only changes the caller's own household", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()

    await updateMoveInPeriod(owner.context, {
      moveInPeriodEndsOn: "2026-09-15",
    })

    await expect(getHouseholdSettings(other.context)).resolves.toEqual({
      moveInPeriodEndsOn: null,
    })
  })

  it("answers NOT_FOUND for a context whose household is gone", async () => {
    const { context } = await fixtures.createHousehold()
    const ghost = { ...context, householdId: crypto.randomUUID() }

    await expect(
      updateMoveInPeriod(ghost, { moveInPeriodEndsOn: "2026-09-15" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(getHouseholdSettings(ghost)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })
})
