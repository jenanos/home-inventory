import { createHash, timingSafeEqual } from "node:crypto"

/** OAuth 2.1 requires S256; `plain` is never advertised or accepted. */
export const SUPPORTED_CODE_CHALLENGE_METHODS = ["S256"] as const

export type CodeChallengeMethod =
  (typeof SUPPORTED_CODE_CHALLENGE_METHODS)[number]

// RFC 7636 section 4.1: the verifier is 43-128 unreserved characters. The
// challenge is a base64url SHA-256 digest and therefore always 43 characters.
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9\-._~]{43}$/

export function isSupportedCodeChallengeMethod(
  value: string | null | undefined
): value is CodeChallengeMethod {
  return (
    value !== null &&
    value !== undefined &&
    (SUPPORTED_CODE_CHALLENGE_METHODS as readonly string[]).includes(value)
  )
}

export function isValidCodeChallenge(
  value: string | null | undefined
): value is string {
  return typeof value === "string" && CODE_CHALLENGE_PATTERN.test(value)
}

export function isValidCodeVerifier(value: string | null | undefined) {
  return typeof value === "string" && CODE_VERIFIER_PATTERN.test(value)
}

export function deriveCodeChallenge(codeVerifier: string) {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url")
}

export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string
) {
  if (!isSupportedCodeChallengeMethod(method)) {
    return false
  }

  if (
    !isValidCodeVerifier(codeVerifier) ||
    !isValidCodeChallenge(codeChallenge)
  ) {
    return false
  }

  const derived = Buffer.from(deriveCodeChallenge(codeVerifier))
  const expected = Buffer.from(codeChallenge)

  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  )
}
