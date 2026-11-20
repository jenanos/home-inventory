import { describe, expect, it } from "vitest"

import { parseGroup, parseView } from "./view"

const options = [{ id: "liste" }, { id: "frist" }] as const

describe("board view preferences", () => {
  it("prefers the URL, then the cookie, then the list", () => {
    expect(parseView("tavle", "liste")).toBe("tavle")
    expect(parseView(undefined, "tavle")).toBe("tavle")
    expect(parseView("bogus", undefined)).toBe("liste")
  })

  it("only accepts groupings the page offers", () => {
    expect(parseGroup(options, "liste", "frist", "liste")).toBe("frist")
    expect(parseGroup(options, "liste", "status", "frist")).toBe("frist")
    expect(parseGroup(options, "liste", undefined, "bogus")).toBe("liste")
  })
})
