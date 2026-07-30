import { describe, expect, it, vi } from "vitest"

import { type ApplicationContextReader, getApplicationContext } from "./context"
import {
  AmbiguousHouseholdMembershipError,
  ApplicationUserNotFoundError,
  HouseholdMembershipRequiredError,
} from "./errors"

function readerReturning(
  value: Awaited<ReturnType<ApplicationContextReader>>
): ApplicationContextReader {
  return vi.fn().mockResolvedValue(value)
}

describe("getApplicationContext", () => {
  it("returns only the trusted user and household boundary", async () => {
    const readUser = readerReturning({
      id: "user-1",
      householdMembers: [{ householdId: "household-1", role: "OWNER" }],
    })

    await expect(getApplicationContext("user-1", readUser)).resolves.toEqual({
      userId: "user-1",
      householdId: "household-1",
      role: "OWNER",
    })
    expect(readUser).toHaveBeenCalledWith("user-1")
  })

  it("fails closed when the user no longer exists", async () => {
    await expect(
      getApplicationContext("deleted-user", readerReturning(null))
    ).rejects.toBeInstanceOf(ApplicationUserNotFoundError)
  })

  it("fails closed when the user has no household", async () => {
    await expect(
      getApplicationContext(
        "user-1",
        readerReturning({ id: "user-1", householdMembers: [] })
      )
    ).rejects.toBeInstanceOf(HouseholdMembershipRequiredError)
  })

  it("fails closed instead of choosing one of multiple households", async () => {
    await expect(
      getApplicationContext(
        "user-1",
        readerReturning({
          id: "user-1",
          householdMembers: [
            { householdId: "household-1", role: "OWNER" },
            { householdId: "household-2", role: "MEMBER" },
          ],
        })
      )
    ).rejects.toBeInstanceOf(AmbiguousHouseholdMembershipError)
  })
})
