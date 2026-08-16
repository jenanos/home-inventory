import { auth } from "@/lib/auth"
import { createMcpUnavailableResponse, mcpConfig } from "@/lib/mcp/config"
import {
  AUTHORIZATION_CODE_TTL_MS,
  buildAuthorizationSuccessRedirect,
  buildClearedConsentCookie,
  consentCsrfTokenMatches,
  CONSENT_COOKIE_NAME,
  deriveConsentCsrfToken,
} from "@/lib/mcp/oauth/authorization"
import { clientRegistry } from "@/lib/mcp/oauth/client-registry"
import {
  noStoreRedirect,
  OAuthError,
  oauthBrowserErrorResponse,
  oauthRedirectErrorResponse,
} from "@/lib/mcp/oauth/errors"
import {
  enforceOAuthRateLimit,
  rateLimitedResponse,
  rateLimitKeyFromRequest,
} from "@/lib/mcp/oauth/rate-limit"
import { readFormBody } from "@/lib/mcp/oauth/request-body"
import { createOAuthTokenRepository } from "@/lib/mcp/oauth/repository"
import { isMcpScope, sortScopes } from "@/lib/mcp/oauth/scopes"
import { hashOpaqueToken } from "@/lib/mcp/oauth/token-hash"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie")
  if (!header) {
    return null
  }

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key === name) {
      return rest.join("=") || null
    }
  }

  return null
}

/**
 * Defence in depth on top of the `SameSite=Lax` consent cookie: a cross-site
 * form POST is refused even if a future browser or cookie change made the
 * cookie travel.
 */
function hasSameOriginOrigin(request: Request, issuer: string) {
  const origin = request.headers.get("origin")
  if (!origin) {
    // Some browsers omit Origin on same-origin form posts; the cookie and CSRF
    // token still have to be right.
    return true
  }

  try {
    return new URL(origin).origin === new URL(issuer).origin
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  if (!mcpConfig.enabled) {
    return createMcpUnavailableResponse()
  }

  const rateLimit = enforceOAuthRateLimit(
    "decision",
    rateLimitKeyFromRequest(request)
  )
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit)
  }

  const clearCookie = buildClearedConsentCookie(mcpConfig.issuer)
  const fail = (error: OAuthError) => {
    const response = oauthBrowserErrorResponse(error)
    response.headers.set("Set-Cookie", clearCookie)
    return response
  }

  if (!hasSameOriginOrigin(request, mcpConfig.issuer)) {
    return fail(
      new OAuthError("invalid_request", "Forespørselen ble avvist.", 403)
    )
  }

  const session = await auth()
  if (!session?.user?.id) {
    return fail(
      new OAuthError("access_denied", "Du er ikke lenger innlogget.", 401)
    )
  }

  const consentToken = readCookie(request, CONSENT_COOKIE_NAME)
  if (!consentToken) {
    return fail(
      new OAuthError(
        "invalid_request",
        "Vi fant ingen aktiv tilkoblingsforespørsel.",
        400
      )
    )
  }

  let form: URLSearchParams
  try {
    form = await readFormBody(request, {
      allowRepeatedParameters: ["scope"],
    })
  } catch (error) {
    return fail(
      error instanceof OAuthError
        ? error
        : new OAuthError("invalid_request", "Ugyldig skjemainnsending.", 400)
    )
  }

  const repository = createOAuthTokenRepository(mcpConfig)
  const pending = await repository.findPendingAuthorizationRequest(consentToken)

  if (!pending || pending.userId !== session.user.id) {
    return fail(
      new OAuthError(
        "invalid_request",
        "Tilkoblingsforespørselen er utløpt eller allerede behandlet.",
        400
      )
    )
  }

  const expectedCsrf = deriveConsentCsrfToken(
    hashOpaqueToken(consentToken, mcpConfig.signingSecret),
    mcpConfig.signingSecret
  )
  if (!consentCsrfTokenMatches(String(form.get("csrf") ?? ""), expectedCsrf)) {
    return fail(
      new OAuthError("invalid_request", "Forespørselen ble avvist.", 403)
    )
  }

  const requestedScopes = pending.requestedScopes.filter(isMcpScope)
  const approvedScopes = sortScopes(
    form
      .getAll("scope")
      .map(String)
      .filter(isMcpScope)
      // Never grant more than the client asked for and the consent screen showed.
      .filter((scope) => requestedScopes.includes(scope))
  )

  const approved =
    form.get("decision") === "approve" && approvedScopes.length > 0

  const consumed = await repository.consumeAuthorizationRequest(
    consentToken,
    approved ? "approved" : "rejected"
  )
  if (!consumed) {
    return fail(
      new OAuthError(
        "invalid_request",
        "Tilkoblingsforespørselen er allerede behandlet.",
        400
      )
    )
  }

  const respond = (response: Response) => {
    response.headers.set("Set-Cookie", clearCookie)
    return response
  }

  if (!approved) {
    return respond(
      oauthRedirectErrorResponse(
        pending.redirectUri,
        "access_denied",
        "Brukeren avviste forespørselen.",
        pending.state
      )
    )
  }

  try {
    const grant = await repository.upsertGrant(
      session.user.id,
      pending.clientId,
      approvedScopes
    )
    await clientRegistry.markClientUsed(pending.clientId)

    const { token: code } = await repository.issueAuthorizationCode({
      clientId: pending.clientId,
      userId: session.user.id,
      redirectUri: pending.redirectUri,
      scopes: approvedScopes,
      resource: pending.resource,
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: pending.codeChallengeMethod,
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
    })

    console.info("[mcp-oauth] consent granted", {
      grantId: grant.id,
      clientId: pending.clientId,
      scopes: approvedScopes,
    })

    return respond(
      noStoreRedirect(
        buildAuthorizationSuccessRedirect(
          pending.redirectUri,
          code,
          mcpConfig.issuer,
          pending.state
        )
      )
    )
  } catch (error) {
    console.error("[mcp-oauth] failed to issue authorization code", error)
    return respond(
      oauthRedirectErrorResponse(
        pending.redirectUri,
        "server_error",
        "Kunne ikke fullføre autoriseringen.",
        pending.state
      )
    )
  }
}
