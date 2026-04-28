import { describe, expect, it } from "vitest"

import { isPublicPathname } from "./middleware"

describe("isPublicPathname", () => {
  it("allows public auth routes", () => {
    expect(isPublicPathname("/login")).toBe(true)
    expect(isPublicPathname("/login/verify")).toBe(true)
    expect(isPublicPathname("/shared/token-123")).toBe(true)
    expect(isPublicPathname("/api/auth/session")).toBe(true)
  })

  it("allows PWA assets without a session", () => {
    expect(isPublicPathname("/manifest.webmanifest")).toBe(true)
    expect(isPublicPathname("/sw.js")).toBe(true)
    expect(isPublicPathname("/apple-icon-180.png")).toBe(true)
    expect(isPublicPathname("/icon-192.png")).toBe(true)
    expect(isPublicPathname("/icon-512.png")).toBe(true)
    expect(isPublicPathname("/icon.svg")).toBe(true)
  })

  it("keeps protected app routes private", () => {
    expect(isPublicPathname("/")).toBe(false)
    expect(isPublicPathname("/lists")).toBe(false)
    expect(isPublicPathname("/settings")).toBe(false)
  })
})
