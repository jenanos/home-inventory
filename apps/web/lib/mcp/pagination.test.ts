import { describe, expect, it } from "vitest"

import { ApplicationError } from "../application/errors"
import { MCP_DEFAULT_PAGE_SIZE } from "./constants"
import {
  buildPageInfo,
  decodeCursor,
  encodeCursor,
  resolvePageRequest,
} from "./pagination"

describe("cursors", () => {
  it("round-trips an offset", () => {
    expect(decodeCursor(encodeCursor(75))).toBe(75)
  })

  it.each([
    ["arbitrary text", "not-a-cursor"],
    ["a negative offset", encodeCursor(-1)],
    ["a fractional offset", Buffer.from("offset:1.5").toString("base64url")],
    ["a foreign payload", Buffer.from("userId:1").toString("base64url")],
  ])("rejects %s as a validation error", (_case, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(ApplicationError)
    expect(() => decodeCursor(cursor)).toThrow(/Ugyldig cursor/)
  })
})

describe("resolvePageRequest", () => {
  it("applies the conservative default limit", () => {
    expect(resolvePageRequest({})).toEqual({
      limit: MCP_DEFAULT_PAGE_SIZE,
      offset: 0,
    })
  })

  it("continues from the cursor", () => {
    expect(resolvePageRequest({ limit: 10, cursor: encodeCursor(20) })).toEqual(
      {
        limit: 10,
        offset: 20,
      }
    )
  })
})

describe("buildPageInfo", () => {
  it("offers the next cursor while items remain", () => {
    const info = buildPageInfo({ limit: 10, offset: 0 }, 10, 25)

    expect(info).toMatchObject({ totalCount: 25, hasMore: true })
    expect(decodeCursor(info.nextCursor ?? "")).toBe(10)
  })

  it("stops at the last page", () => {
    expect(buildPageInfo({ limit: 10, offset: 20 }, 5, 25)).toEqual({
      totalCount: 25,
      returnedCount: 5,
      hasMore: false,
      nextCursor: null,
    })
  })

  it("reports an empty result without a cursor", () => {
    expect(buildPageInfo({ limit: 25, offset: 0 }, 0, 0)).toMatchObject({
      hasMore: false,
      nextCursor: null,
    })
  })
})
