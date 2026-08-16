import { describe, expect, it } from "vitest"

import {
  buildAuthorizationSuccessRedirect,
  buildClearedConsentCookie,
  buildConsentCookie,
  buildLoginRedirectPath,
  consentCsrfTokenMatches,
  DEFAULT_REQUESTED_SCOPES,
  deriveConsentCsrfToken,
  readAuthorizeParams,
  resourceMatchesCanonical,
  validateAuthorizeRequest,
} from "./authorization"
import { OAuthError } from "./errors"

const CANONICAL_RESOURCE = "https://home.jenanos.xyz/api/mcp"
const CLIENT = { redirectUris: ["https://client.example/callback"] }
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

function params(overrides: Record<string, string | null> = {}) {
  return {
    clientId: "https://client.example/metadata.json",
    redirectUri: "https://client.example/callback",
    responseType: "code",
    codeChallenge: CHALLENGE,
    codeChallengeMethod: "S256",
    scope: "shopping:read",
    state: "state-value",
    resource: CANONICAL_RESOURCE,
    ...overrides,
  }
}

describe("validateAuthorizeRequest", () => {
  it("accepts a well-formed request", () => {
    const result = validateAuthorizeRequest(
      params(),
      CLIENT,
      CANONICAL_RESOURCE
    )

    expect(result).toEqual({
      kind: "ok",
      request: {
        redirectUri: "https://client.example/callback",
        scopes: ["shopping:read"],
        state: "state-value",
        codeChallenge: CHALLENGE,
        codeChallengeMethod: "S256",
        resource: CANONICAL_RESOURCE,
      },
    })
  })

  it("throws instead of redirecting when the redirect URI is not registered", () => {
    expect(() =>
      validateAuthorizeRequest(
        params({ redirectUri: "https://evil.example/callback" }),
        CLIENT,
        CANONICAL_RESOURCE
      )
    ).toThrow(OAuthError)

    expect(() =>
      validateAuthorizeRequest(
        params({ redirectUri: null }),
        CLIENT,
        CANONICAL_RESOURCE
      )
    ).toThrow(OAuthError)
  })

  it("redirects the error once the redirect URI is trusted", () => {
    const result = validateAuthorizeRequest(
      params({ responseType: "token" }),
      CLIENT,
      CANONICAL_RESOURCE
    )

    expect(result).toMatchObject({
      kind: "redirect",
      redirectUri: "https://client.example/callback",
      error: "unsupported_response_type",
      state: "state-value",
    })
  })

  it("requires S256 PKCE", () => {
    expect(
      validateAuthorizeRequest(
        params({ codeChallengeMethod: "plain" }),
        CLIENT,
        CANONICAL_RESOURCE
      )
    ).toMatchObject({ kind: "redirect", error: "invalid_request" })

    expect(
      validateAuthorizeRequest(
        params({ codeChallenge: null, codeChallengeMethod: "S256" }),
        CLIENT,
        CANONICAL_RESOURCE
      )
    ).toMatchObject({ kind: "redirect", error: "invalid_request" })
  })

  it("refuses a resource that names another server", () => {
    expect(
      validateAuthorizeRequest(
        params({ resource: "https://other.example/api/mcp" }),
        CLIENT,
        CANONICAL_RESOURCE
      )
    ).toMatchObject({ kind: "redirect", error: "invalid_request" })
  })

  it("binds a missing resource to the canonical one", () => {
    const result = validateAuthorizeRequest(
      params({ resource: null }),
      CLIENT,
      CANONICAL_RESOURCE
    )

    expect(result).toMatchObject({
      kind: "ok",
      request: { resource: CANONICAL_RESOURCE },
    })
  })

  it("rejects unknown scopes", () => {
    expect(
      validateAuthorizeRequest(
        params({ scope: "shopping:read admin:all" }),
        CLIENT,
        CANONICAL_RESOURCE
      )
    ).toMatchObject({ kind: "redirect", error: "invalid_scope" })
  })

  it("falls back to read-only scopes when the client sends none", () => {
    const result = validateAuthorizeRequest(
      params({ scope: null }),
      CLIENT,
      CANONICAL_RESOURCE
    )

    expect(result).toMatchObject({
      kind: "ok",
      request: { scopes: DEFAULT_REQUESTED_SCOPES },
    })
    expect(
      DEFAULT_REQUESTED_SCOPES.every((scope) => scope.endsWith(":read"))
    ).toBe(true)
  })

  it("rejects an oversized state", () => {
    expect(
      validateAuthorizeRequest(
        params({ state: "s".repeat(513) }),
        CLIENT,
        CANONICAL_RESOURCE
      )
    ).toMatchObject({ kind: "redirect", error: "invalid_request", state: null })
  })
})

describe("resourceMatchesCanonical", () => {
  it("normalises case and a trailing slash", () => {
    expect(
      resourceMatchesCanonical(
        "HTTPS://HOME.JENANOS.XYZ/api/mcp",
        CANONICAL_RESOURCE
      )
    ).toBe(true)
    expect(
      resourceMatchesCanonical(`${CANONICAL_RESOURCE}/`, CANONICAL_RESOURCE)
    ).toBe(true)
  })

  it("does not normalise away a different host or path", () => {
    expect(
      resourceMatchesCanonical(
        "https://home.jenanos.xyz/api",
        CANONICAL_RESOURCE
      )
    ).toBe(false)
    expect(
      resourceMatchesCanonical(
        "https://evil.example/api/mcp",
        CANONICAL_RESOURCE
      )
    ).toBe(false)
    expect(resourceMatchesCanonical("not-a-url", CANONICAL_RESOURCE)).toBe(
      false
    )
  })
})

describe("readAuthorizeParams", () => {
  it("reads every parameter the flow needs", () => {
    const url = new URL(
      "https://home.jenanos.xyz/api/oauth/authorize?client_id=c&redirect_uri=r&response_type=code&code_challenge=x&code_challenge_method=S256&scope=shopping:read&state=s&resource=res"
    )

    expect(readAuthorizeParams(url)).toEqual({
      clientId: "c",
      redirectUri: "r",
      responseType: "code",
      codeChallenge: "x",
      codeChallengeMethod: "S256",
      scope: "shopping:read",
      state: "s",
      resource: "res",
    })
  })

  it("rejects duplicated OAuth parameters", () => {
    const url = new URL(
      "https://home.jenanos.xyz/api/oauth/authorize?client_id=first&client_id=second"
    )

    expect(() => readAuthorizeParams(url)).toThrowError(
      expect.objectContaining({ code: "invalid_request" })
    )
  })
})

describe("consent CSRF token", () => {
  const secret = "consent-secret".padEnd(32, "-")

  it("is bound to the specific authorization request", () => {
    const first = deriveConsentCsrfToken("hash-a", secret)
    const second = deriveConsentCsrfToken("hash-b", secret)

    expect(first).not.toBe(second)
    expect(consentCsrfTokenMatches(first, first)).toBe(true)
    expect(consentCsrfTokenMatches(second, first)).toBe(false)
    expect(consentCsrfTokenMatches("", first)).toBe(false)
  })

  it("changes when the signing secret changes", () => {
    expect(deriveConsentCsrfToken("hash-a", secret)).not.toBe(
      deriveConsentCsrfToken("hash-a", "other-secret".padEnd(32, "-"))
    )
  })
})

describe("consent cookie", () => {
  it("is httpOnly, lax and secure over https", () => {
    const cookie = buildConsentCookie("token-value", "https://home.jenanos.xyz")

    expect(cookie).toContain("mcp-oauth-consent=token-value")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Lax")
    expect(cookie).toContain("Secure")
  })

  it("omits Secure for a loopback issuer so local development works", () => {
    expect(buildConsentCookie("t", "http://127.0.0.1:3000")).not.toContain(
      "Secure"
    )
  })

  it("expires the cookie when cleared", () => {
    expect(buildClearedConsentCookie("https://home.jenanos.xyz")).toContain(
      "Max-Age=0"
    )
  })
})

describe("buildAuthorizationSuccessRedirect", () => {
  it("round-trips state unchanged and identifies the issuer", () => {
    const target = buildAuthorizationSuccessRedirect(
      "https://client.example/callback",
      "the-code",
      "https://home.jenanos.xyz",
      "state with spaces & symbols"
    )
    const url = new URL(target)

    expect(url.searchParams.get("code")).toBe("the-code")
    expect(url.searchParams.get("iss")).toBe("https://home.jenanos.xyz")
    expect(url.searchParams.get("state")).toBe("state with spaces & symbols")
  })

  it("omits state when the client sent none", () => {
    const url = new URL(
      buildAuthorizationSuccessRedirect(
        "https://client.example/callback",
        "c",
        "https://home.jenanos.xyz",
        null
      )
    )

    expect(url.searchParams.has("state")).toBe(false)
  })
})

describe("buildLoginRedirectPath", () => {
  it("keeps the authorize query so the flow resumes after login", () => {
    const url = new URL(
      "https://home.jenanos.xyz/api/oauth/authorize?client_id=c&state=s"
    )

    expect(buildLoginRedirectPath(url)).toBe(
      "/login?callbackUrl=%2Fapi%2Foauth%2Fauthorize%3Fclient_id%3Dc%26state%3Ds"
    )
  })
})
