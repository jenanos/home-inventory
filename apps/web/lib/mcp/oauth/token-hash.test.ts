import { describe, expect, it } from "vitest"

import { generateOpaqueToken, hashOpaqueToken } from "./token-hash"

describe("OAuth token hashing", () => {
  it("generates high-entropy URL-safe tokens", () => {
    const first = generateOpaqueToken()
    const second = generateOpaqueToken()

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(second).not.toBe(first)
  })

  it("creates stable, secret-bound hashes without retaining the token", () => {
    const token = "not-stored-in-plaintext"
    const first = hashOpaqueToken(token, "a".repeat(32))
    const second = hashOpaqueToken(token, "a".repeat(32))
    const otherSecret = hashOpaqueToken(token, "b".repeat(32))

    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(first).not.toContain(token)
    expect(otherSecret).not.toBe(first)
  })

  it("rejects missing token material", () => {
    expect(() => hashOpaqueToken("", "a".repeat(32))).toThrow(TypeError)
    expect(() => hashOpaqueToken("token", "")).toThrow(TypeError)
  })
})
