import { beforeEach, describe, expect, it } from "vitest"

import {
  consumeRateLimit,
  enforceOAuthRateLimit,
  rateLimitKeyFromRequest,
  resetRateLimitsForTesting,
} from "./rate-limit"

beforeEach(() => {
  resetRateLimitsForTesting()
})

describe("consumeRateLimit", () => {
  const rule = { limit: 2, windowMs: 60_000 }

  it("allows up to the limit and then blocks", () => {
    expect(consumeRateLimit("a", rule, 0).allowed).toBe(true)
    expect(consumeRateLimit("a", rule, 0).allowed).toBe(true)

    const blocked = consumeRateLimit("a", rule, 0)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(60)
  })

  it("keeps separate counters per key", () => {
    consumeRateLimit("a", rule, 0)
    consumeRateLimit("a", rule, 0)

    expect(consumeRateLimit("b", rule, 0).allowed).toBe(true)
  })

  it("starts a new window once the old one expires", () => {
    consumeRateLimit("a", rule, 0)
    consumeRateLimit("a", rule, 0)
    expect(consumeRateLimit("a", rule, 0).allowed).toBe(false)

    expect(consumeRateLimit("a", rule, 60_001).allowed).toBe(true)
  })
})

describe("enforceOAuthRateLimit", () => {
  it("does not let one bucket exhaust another", () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      enforceOAuthRateLimit("register", "1.2.3.4", 0)
    }

    expect(enforceOAuthRateLimit("register", "1.2.3.4", 0).allowed).toBe(false)
    expect(enforceOAuthRateLimit("token", "1.2.3.4", 0).allowed).toBe(true)
  })
})

describe("rateLimitKeyFromRequest", () => {
  it("uses the left-most forwarded address", () => {
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    })

    expect(rateLimitKeyFromRequest(request)).toBe("203.0.113.5")
  })

  it("falls back to a constant bucket when no address is present", () => {
    expect(rateLimitKeyFromRequest(new Request("https://example.test"))).toBe(
      "unknown"
    )
  })
})
