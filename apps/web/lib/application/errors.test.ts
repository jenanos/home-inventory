import { describe, expect, it } from "vitest"

import {
  AmbiguousHouseholdMembershipError,
  ApplicationError,
  isApplicationError,
} from "./errors"

describe("ApplicationError", () => {
  it("exposes a stable error code", () => {
    const error = new ApplicationError("VALIDATION_ERROR", "Ugyldig verdi")

    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe("VALIDATION_ERROR")
    expect(isApplicationError(error)).toBe(true)
    expect(isApplicationError(new Error("boom"))).toBe(false)
  })

  it("uses the stable forbidden code for ambiguous memberships", () => {
    expect(new AmbiguousHouseholdMembershipError().code).toBe("FORBIDDEN")
  })
})
