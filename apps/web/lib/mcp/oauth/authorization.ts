import { createHmac, timingSafeEqual } from "node:crypto"

import { OAuthError, type OAuthErrorCode } from "./errors"
import { isSupportedCodeChallengeMethod, isValidCodeChallenge } from "./pkce"
import { matchRedirectUri } from "./redirect-uri"
import { MCP_SCOPES, parseScopeParameter, type McpScope } from "./scopes"

/** Lifetime of the consent request row and its browser cookie. */
export const AUTHORIZATION_REQUEST_TTL_MS = 10 * 60 * 1000

/** Authorization codes are single-use and short-lived (OAuth 2.1 section 7.5). */
export const AUTHORIZATION_CODE_TTL_MS = 60 * 1000

export const CONSENT_COOKIE_NAME = "mcp-oauth-consent"

export const MAX_STATE_LENGTH = 512

/** Scopes pre-selected when the client sends no `scope` parameter at all. */
export const DEFAULT_REQUESTED_SCOPES: McpScope[] = [
  "shopping:read",
  "budget:read",
  "maintenance:read",
  "garden:read",
]

export type AuthorizeRequestParams = {
  clientId: string | null
  redirectUri: string | null
  responseType: string | null
  codeChallenge: string | null
  codeChallengeMethod: string | null
  scope: string | null
  state: string | null
  resource: string | null
}

export type ValidatedAuthorizeRequest = {
  redirectUri: string
  scopes: McpScope[]
  state: string | null
  codeChallenge: string
  codeChallengeMethod: "S256"
  resource: string
}

/**
 * An error the client must be told about by redirect. Only reachable after the
 * redirect URI has been matched against the registered ones.
 */
export type AuthorizeRedirectError = {
  kind: "redirect"
  redirectUri: string
  error: OAuthErrorCode
  description: string
  state: string | null
}

export type AuthorizeValidationResult =
  | { kind: "ok"; request: ValidatedAuthorizeRequest }
  | AuthorizeRedirectError

export function readAuthorizeParams(url: URL): AuthorizeRequestParams {
  const get = (name: string) => {
    const values = url.searchParams.getAll(name)
    if (values.length > 1) {
      throw new OAuthError(
        "invalid_request",
        `Parameteren ${name} kan ikke oppgis flere ganger.`,
        400
      )
    }

    return values[0] ?? null
  }

  return {
    clientId: get("client_id"),
    redirectUri: get("redirect_uri"),
    responseType: get("response_type"),
    codeChallenge: get("code_challenge"),
    codeChallengeMethod: get("code_challenge_method"),
    scope: get("scope"),
    state: get("state"),
    resource: get("resource"),
  }
}

/**
 * Compares a client-supplied `resource` with the canonical resource.
 *
 * The MCP specification tells clients to send the canonical form but also to
 * accept uppercase scheme and host, and it treats a trailing slash as
 * insignificant, so both are normalised away before comparing.
 */
export function resourceMatchesCanonical(value: string, canonical: string) {
  const normalize = (input: string) => {
    let url: URL
    try {
      url = new URL(input)
    } catch {
      return null
    }

    if (url.hash) {
      return null
    }

    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${path}${url.search}`
  }

  const normalizedValue = normalize(value)
  return normalizedValue !== null && normalizedValue === normalize(canonical)
}

/**
 * Validates everything that can be checked once the client is known.
 *
 * `client_id` and `redirect_uri` failures are not handled here: they must abort
 * without redirecting, so the caller resolves them first.
 */
export function validateAuthorizeRequest(
  params: AuthorizeRequestParams,
  client: { redirectUris: string[] },
  canonicalResource: string,
  offeredScopes: readonly McpScope[] = MCP_SCOPES
): AuthorizeValidationResult {
  if (!params.redirectUri) {
    throw new OAuthError("invalid_request", "redirect_uri er påkrevd.", 400)
  }

  const match = matchRedirectUri(params.redirectUri, client.redirectUris)
  if (!match.ok) {
    throw new OAuthError(
      "invalid_redirect_uri",
      "redirect_uri er ikke registrert for denne klienten.",
      400
    )
  }

  const redirectUri = match.redirectUri
  const state =
    params.state && params.state.length <= MAX_STATE_LENGTH
      ? params.state
      : null

  const fail = (
    error: OAuthErrorCode,
    description: string
  ): AuthorizeRedirectError => ({
    kind: "redirect",
    redirectUri,
    error,
    description,
    state,
  })

  if (params.state && params.state.length > MAX_STATE_LENGTH) {
    return fail(
      "invalid_request",
      `state kan være maksimalt ${MAX_STATE_LENGTH} tegn.`
    )
  }

  if (params.responseType !== "code") {
    return fail("unsupported_response_type", "Kun response_type=code støttes.")
  }

  if (!isSupportedCodeChallengeMethod(params.codeChallengeMethod)) {
    return fail("invalid_request", "code_challenge_method=S256 er påkrevd.")
  }

  if (!isValidCodeChallenge(params.codeChallenge)) {
    return fail("invalid_request", "code_challenge mangler eller er ugyldig.")
  }

  // RFC 8707. A missing value is tolerated and bound to the canonical resource
  // anyway; a present value that names another resource is refused, so a token
  // can never be minted for someone else's server.
  if (
    params.resource &&
    !resourceMatchesCanonical(params.resource, canonicalResource)
  ) {
    return fail(
      "invalid_request",
      "resource må være den kanoniske MCP-URL-en for denne serveren."
    )
  }

  const { scopes: requested, unknown } = parseScopeParameter(params.scope)
  if (unknown.length > 0) {
    return fail("invalid_scope", "Forespørselen inneholder ukjente scopes.")
  }

  // A known scope this deployment does not offer right now — a write scope
  // whose domain is switched off — is dropped rather than refused. RFC 6749
  // 3.3 lets the server grant less than was asked, and the token response
  // reports what was actually granted.
  const scopes = requested.filter((scope) => offeredScopes.includes(scope))

  return {
    kind: "ok",
    request: {
      redirectUri,
      scopes: scopes.length > 0 ? scopes : DEFAULT_REQUESTED_SCOPES,
      state,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: "S256",
      resource: canonicalResource,
    },
  }
}

/**
 * CSRF token for the consent form.
 *
 * The consent cookie is `SameSite=Lax` and therefore already absent on a
 * cross-site POST. This value is defence in depth: it is derived from the
 * request's own hash, so it cannot be guessed or replayed against another
 * authorization request.
 */
export function deriveConsentCsrfToken(
  requestTokenHash: string,
  signingSecret: string
) {
  return createHmac("sha256", signingSecret)
    .update("home-overview:mcp-oauth-consent-csrf:v1")
    .update("\0")
    .update(requestTokenHash)
    .digest("base64url")
}

export function consentCsrfTokenMatches(
  provided: string,
  expected: string
): boolean {
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  )
}

/**
 * Builds the successful authorization response. `iss` is included per RFC 9207
 * because the discovery document advertises support for it.
 */
export function buildAuthorizationSuccessRedirect(
  redirectUri: string,
  code: string,
  issuer: string,
  state: string | null
) {
  const target = new URL(redirectUri)
  target.searchParams.set("code", code)
  target.searchParams.set("iss", issuer)
  if (state) {
    target.searchParams.set("state", state)
  }

  return target.toString()
}

/**
 * The one-time consent secret lives in an httpOnly cookie rather than the URL,
 * so it cannot leak through a `Referer` header, browser history or a shared
 * link. `SameSite=Lax` survives the redirect from the authorize endpoint but
 * is not sent on a cross-site form POST.
 */
export function buildConsentCookie(token: string, issuer: string) {
  const attributes = [
    `${CONSENT_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(AUTHORIZATION_REQUEST_TTL_MS / 1000)}`,
  ]

  if (issuer.startsWith("https:")) {
    attributes.push("Secure")
  }

  return attributes.join("; ")
}

export function buildClearedConsentCookie(issuer: string) {
  const attributes = [
    `${CONSENT_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ]

  if (issuer.startsWith("https:")) {
    attributes.push("Secure")
  }

  return attributes.join("; ")
}

/**
 * Only same-origin callback paths are accepted, so a crafted `callbackUrl`
 * cannot bounce the user off-site after login.
 */
export function buildLoginRedirectPath(authorizeUrl: URL) {
  const callback = `${authorizeUrl.pathname}${authorizeUrl.search}`
  const safeCallback =
    callback.startsWith("/") && !callback.startsWith("//") ? callback : "/"

  return `/login?callbackUrl=${encodeURIComponent(safeCallback)}`
}
