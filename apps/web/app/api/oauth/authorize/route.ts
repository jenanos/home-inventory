import { auth } from "@/lib/auth"
import { createMcpUnavailableResponse, mcpConfig } from "@/lib/mcp/config"
import {
  AUTHORIZATION_REQUEST_TTL_MS,
  buildConsentCookie,
  buildLoginRedirectPath,
  readAuthorizeParams,
  validateAuthorizeRequest,
} from "@/lib/mcp/oauth/authorization"
import { clientRegistry } from "@/lib/mcp/oauth/client-registry"
import {
  noStoreRedirect,
  OAuthError,
  oauthBrowserErrorResponse,
  oauthRedirectErrorResponse,
} from "@/lib/mcp/oauth/errors"
import { OAUTH_ENDPOINT_PATHS } from "@/lib/mcp/oauth/metadata"
import {
  enforceOAuthRateLimit,
  rateLimitedResponse,
  rateLimitKeyFromRequest,
} from "@/lib/mcp/oauth/rate-limit"
import { createOAuthTokenRepository } from "@/lib/mcp/oauth/repository"
import { enabledScopes } from "@/lib/mcp/oauth/scopes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function toBrowserError(error: unknown) {
  if (error instanceof OAuthError) {
    return oauthBrowserErrorResponse(error)
  }

  console.error("[mcp-oauth] authorize failed", error)
  return oauthBrowserErrorResponse(
    new OAuthError(
      "server_error",
      "Noe gikk galt under autorisering. Prøv igjen.",
      500
    )
  )
}

export async function GET(request: Request) {
  if (!mcpConfig.enabled) {
    return createMcpUnavailableResponse()
  }

  const rateLimit = enforceOAuthRateLimit(
    "authorize",
    rateLimitKeyFromRequest(request)
  )
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit)
  }

  const url = new URL(request.url)
  let params
  try {
    params = readAuthorizeParams(url)
  } catch (error) {
    return toBrowserError(error)
  }

  if (!params.clientId) {
    return oauthBrowserErrorResponse(
      new OAuthError("invalid_request", "client_id er påkrevd.", 400)
    )
  }

  // Everything up to and including the redirect-URI match must fail without
  // redirecting: an unverified redirect_uri is an open-redirect primitive.
  let validated
  try {
    const client = await clientRegistry.resolveClient(params.clientId)
    validated = validateAuthorizeRequest(
      params,
      client,
      mcpConfig.resource,
      enabledScopes(mcpConfig.writeDomains)
    )
  } catch (error) {
    return toBrowserError(error)
  }

  if (validated.kind === "redirect") {
    return oauthRedirectErrorResponse(
      validated.redirectUri,
      validated.error,
      validated.description,
      validated.state
    )
  }

  const session = await auth()
  if (!session?.user?.id) {
    return noStoreRedirect(buildLoginRedirectPath(url))
  }

  try {
    const repository = createOAuthTokenRepository(mcpConfig)
    const { token } = await repository.createAuthorizationRequest({
      clientId: params.clientId,
      userId: session.user.id,
      redirectUri: validated.request.redirectUri,
      codeChallenge: validated.request.codeChallenge,
      codeChallengeMethod: validated.request.codeChallengeMethod,
      requestedScopes: validated.request.scopes,
      resource: validated.request.resource,
      state: validated.request.state ?? undefined,
      expiresAt: new Date(Date.now() + AUTHORIZATION_REQUEST_TTL_MS),
    })

    const response = noStoreRedirect(OAUTH_ENDPOINT_PATHS.consent)
    response.headers.set(
      "Set-Cookie",
      buildConsentCookie(token, mcpConfig.issuer)
    )

    return response
  } catch (error) {
    return toBrowserError(error)
  }
}
