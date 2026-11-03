import { describe, expect, it } from "vitest"

import {
  deriveCodeChallenge,
  isSupportedCodeChallengeMethod,
  isValidCodeVerifier,
  verifyCodeChallenge,
} from "./pkce"

// RFC 7636 appendix B.
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

describe("deriveCodeChallenge", () => {
  it("matches the RFC 7636 S256 test vector", () => {
    expect(deriveCodeChallenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE)
  })
})

describe("verifyCodeChallenge", () => {
  it("accepts the matching verifier", () => {
    expect(verifyCodeChallenge(RFC_VERIFIER, RFC_CHALLENGE, "S256")).toBe(true)
  })

  it("rejects a different verifier", () => {
    const other = "a".repeat(43)
    expect(verifyCodeChallenge(other, RFC_CHALLENGE, "S256")).toBe(false)
  })

  it("rejects the plain method even when the values match", () => {
    expect(verifyCodeChallenge(RFC_VERIFIER, RFC_VERIFIER, "plain")).toBe(false)
    expect(isSupportedCodeChallengeMethod("plain")).toBe(false)
  })

  it("rejects verifiers outside the RFC length range", () => {
    expect(isValidCodeVerifier("a".repeat(42))).toBe(false)
    expect(isValidCodeVerifier("a".repeat(43))).toBe(true)
    expect(isValidCodeVerifier("a".repeat(128))).toBe(true)
    expect(isValidCodeVerifier("a".repeat(129))).toBe(false)
    expect(isValidCodeVerifier(`${"a".repeat(42)}$`)).toBe(false)
  })
})
