import { describe, expect, it } from "vitest"

import {
  canManageShoppingListPrivacy,
  getVisibleShoppingListsWhere,
  isShoppingListAccessible,
} from "./shopping-list-access"

describe("getVisibleShoppingListsWhere", () => {
  it("returns a filter for shared lists and user-owned private lists", () => {
    expect(getVisibleShoppingListsWhere("household-1", "user-1")).toEqual({
      householdId: "household-1",
      OR: [{ isPrivate: false }, { createdById: "user-1" }],
    })
  })
})

describe("isShoppingListAccessible", () => {
  it("rejects null lists", () => {
    expect(isShoppingListAccessible(null, "household-1", "user-1")).toBe(false)
  })

  it("rejects lists from other households", () => {
    expect(
      isShoppingListAccessible(
        { householdId: "household-2", isPrivate: false, createdById: "user-1" },
        "household-1",
        "user-1"
      )
    ).toBe(false)
  })

  it("allows shared lists in the same household", () => {
    expect(
      isShoppingListAccessible(
        { householdId: "household-1", isPrivate: false, createdById: null },
        "household-1",
        "user-2"
      )
    ).toBe(true)
  })

  it("allows private lists owned by the current user", () => {
    expect(
      isShoppingListAccessible(
        { householdId: "household-1", isPrivate: true, createdById: "user-1" },
        "household-1",
        "user-1"
      )
    ).toBe(true)
  })

  it("rejects private lists owned by another user", () => {
    expect(
      isShoppingListAccessible(
        { householdId: "household-1", isPrivate: true, createdById: "user-2" },
        "household-1",
        "user-1"
      )
    ).toBe(false)
  })
})

describe("canManageShoppingListPrivacy", () => {
  it("allows the creator to manage privacy", () => {
    expect(
      canManageShoppingListPrivacy(
        { isPrivate: true, createdById: "user-1" },
        "user-1"
      )
    ).toBe(true)
  })

  it("rejects non-creators for private lists", () => {
    expect(
      canManageShoppingListPrivacy(
        { isPrivate: true, createdById: "user-2" },
        "user-1"
      )
    ).toBe(false)
  })

  it("allows anyone to claim an unclaimed shared list", () => {
    expect(
      canManageShoppingListPrivacy(
        { isPrivate: false, createdById: null },
        "user-1"
      )
    ).toBe(true)
  })
})
