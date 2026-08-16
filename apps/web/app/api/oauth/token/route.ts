import { createMcpUnavailableResponse, mcpConfig } from "@/lib/mcp/config"
import { issueAccessToken } from "@/lib/mcp/oauth/access-token"
import { resourceMatchesCanonical } from "@/lib/mcp/oauth/authorization"
import { clientRegistry } from "@/lib/mcp/oauth/client-registry"
import {
  OAuthError,
  oauthErrorResponse,
  oauthJsonResponse,
} from "@/lib/mcp/oauth/errors"
import { verifyCodeChallenge } from "@/lib/mcp/oauth/pkce"
import {
  enforceOAuthRateLimit,
  rateLimitedResponse,
  rateLimitKeyFromRequest,
} from "@/lib/mcp/oauth/rate-limit"
import { readFormBody } from "@/lib/mcp/oauth/request-body"
import { createOAuthTokenRepository } from "@/lib/mcp/oauth/repository"
import {
  formatScopeParameter,
  isMcpScope,
  sortScopes,
  type McpScope,
} from "@/lib/mcp/oauth/scopes"
import type { McpOAuthTokenRepository } from "@/lib/mcp/oauth/token-repository"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type EnabledConfig = Extract<typeof mcpConfig, { enabled: true }>

function refreshTokenExpiry(config: EnabledConfig) {
  return new Date(Date.now() + config.refreshTokenTtlSeconds * 1000)
}

/**
 * A deliberately vague message. Distinguishing "unknown code" from "expired
 * code" from "wrong client" would tell an attacker which half of a guess was
 * right.
 */
function invalidGrant(): never {
  throw new OAuthError(
    "invalid_grant",
    "Koden eller refresh-tokenet er ugyldig, utløpt eller allerede brukt.",
    400
  )
}

async function issueTokenResponse(
  config: EnabledConfig,
  repository: McpOAuthTokenRepository,
  input: {
    userId: string
    clientId: string
    grantId: string
    scopes: McpScope[]
    refreshFamilyId?: string
    refreshToken?: string
  }
) {
  const accessToken = issueAccessToken({
    issuer: config.issuer,
    resource: config.resource,
    signingSecret: config.signingSecret,
    userId: input.userId,
    clientId: input.clientId,
    scopes: input.scopes,
    expiresInSeconds: config.accessTokenTtlSeconds,
  })

  let refreshToken = input.refreshToken
  if (!refreshToken) {
    const issued = await repository.issueRefreshToken(
      input.grantId,
      refreshTokenExpiry(config),
      input.refreshFamilyId
    )

    if (!issued) {
      invalidGrant()
    }

    refreshToken = issued.token
  }

  await repository.touchGrant(input.grantId)
  await clientRegistry.markClientUsed(input.clientId)

  return oauthJsonResponse({
    access_token: accessToken.token,
    token_type: "Bearer",
    expires_in: config.accessTokenTtlSeconds,
    refresh_token: refreshToken,
    scope: formatScopeParameter(input.scopes),
  })
}

async function handleAuthorizationCodeGrant(
  config: EnabledConfig,
  repository: McpOAuthTokenRepository,
  form: URLSearchParams
) {
  const clientId = form.get("client_id")
  const code = form.get("code")
  const codeVerifier = form.get("code_verifier")
  const redirectUri = form.get("redirect_uri")
  const resource = form.get("resource")

  if (!clientId || !code || !codeVerifier || !redirectUri) {
    throw new OAuthError(
      "invalid_request",
      "client_id, code, code_verifier og redirect_uri er påkrevd.",
      400
    )
  }

  const authorizationCode = await repository.consumeAuthorizationCode(code)

  if (!authorizationCode) {
    // OAuth 2.1 section 7.5: a replayed code means the code leaked, so any
    // tokens already derived from that grant are revoked.
    const replayed = await repository.findAuthorizationCodeForReplay(code)
    if (replayed?.consumedAt) {
      const revoked = await repository.revokeGrantTokens(
        replayed.userId,
        replayed.clientId
      )
      console.warn("[mcp-oauth] authorization code replay detected", {
        clientId: replayed.clientId,
        revokedRefreshTokens: revoked.revoked,
      })
    }

    invalidGrant()
  }

  if (authorizationCode.clientId !== clientId) {
    invalidGrant()
  }

  if (authorizationCode.redirectUri !== redirectUri) {
    invalidGrant()
  }

  if (resource && !resourceMatchesCanonical(resource, config.resource)) {
    throw new OAuthError(
      "invalid_request",
      "resource må være den kanoniske MCP-URL-en for denne serveren.",
      400
    )
  }

  if (
    !verifyCodeChallenge(
      codeVerifier,
      authorizationCode.codeChallenge,
      authorizationCode.codeChallengeMethod
    )
  ) {
    invalidGrant()
  }

  const grant = await repository.findActiveGrant(
    authorizationCode.userId,
    authorizationCode.clientId
  )
  if (!grant) {
    invalidGrant()
  }

  // The code carries what the user consented to; the grant is the current
  // truth. The intersection can only ever shrink the token.
  const scopes = sortScopes(
    authorizationCode.scopes
      .filter(isMcpScope)
      .filter((scope) => grant.scopes.includes(scope))
  )
  if (scopes.length === 0) {
    invalidGrant()
  }

  return issueTokenResponse(config, repository, {
    userId: authorizationCode.userId,
    clientId: authorizationCode.clientId,
    grantId: grant.id,
    scopes,
  })
}

async function handleRefreshTokenGrant(
  config: EnabledConfig,
  repository: McpOAuthTokenRepository,
  form: URLSearchParams
) {
  const clientId = form.get("client_id")
  const refreshToken = form.get("refresh_token")
  const resource = form.get("resource")

  if (!clientId || !refreshToken) {
    throw new OAuthError(
      "invalid_request",
      "client_id og refresh_token er påkrevd.",
      400
    )
  }

  if (resource && !resourceMatchesCanonical(resource, config.resource)) {
    throw new OAuthError(
      "invalid_request",
      "resource må være den kanoniske MCP-URL-en for denne serveren.",
      400
    )
  }

  const existing = await repository.findRefreshToken(refreshToken)
  if (!existing || existing.grant.clientId !== clientId) {
    invalidGrant()
  }

  const rotated = await repository.rotateRefreshToken(
    refreshToken,
    refreshTokenExpiry(config)
  )

  if (rotated.status === "reuse-detected") {
    console.warn("[mcp-oauth] refresh token reuse detected", {
      clientId,
      familyId: rotated.familyId,
    })
    invalidGrant()
  }

  if (rotated.status !== "rotated") {
    invalidGrant()
  }

  const grant = await repository.findActiveGrant(
    existing.grant.userId,
    existing.grant.clientId
  )
  if (!grant) {
    invalidGrant()
  }

  // Scopes come from the grant, so a consent that was narrowed after the token
  // was issued takes effect on the next refresh.
  const scopes = sortScopes(grant.scopes.filter(isMcpScope))
  if (scopes.length === 0) {
    invalidGrant()
  }

  return issueTokenResponse(config, repository, {
    userId: grant.userId,
    clientId: grant.clientId,
    grantId: grant.id,
    scopes,
    refreshToken: rotated.token,
  })
}

export async function POST(request: Request) {
  if (!mcpConfig.enabled) {
    return createMcpUnavailableResponse()
  }

  const rateLimit = enforceOAuthRateLimit(
    "token",
    rateLimitKeyFromRequest(request)
  )
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit)
  }

  const repository = createOAuthTokenRepository(mcpConfig)

  try {
    const form = await readFormBody(request)
    const grantType = form.get("grant_type")

    if (grantType === "authorization_code") {
      return await handleAuthorizationCodeGrant(mcpConfig, repository, form)
    }

    if (grantType === "refresh_token") {
      return await handleRefreshTokenGrant(mcpConfig, repository, form)
    }

    throw new OAuthError(
      "unsupported_grant_type",
      "Kun authorization_code og refresh_token støttes.",
      400
    )
  } catch (error) {
    if (error instanceof OAuthError) {
      return oauthErrorResponse(error)
    }

    console.error("[mcp-oauth] token endpoint failed", error)
    return oauthErrorResponse(
      new OAuthError("server_error", "Kunne ikke utstede token.", 500)
    )
  }
}
