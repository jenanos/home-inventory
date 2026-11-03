import type { McpConfig } from "../config"
import {
  verifyAccessToken,
  type AccessTokenClaims,
  type AccessTokenVerificationFailure,
} from "../oauth/access-token"
import { protectedResourceMetadataUrl } from "../oauth/metadata"
import type { McpScope } from "../oauth/scopes"

type EnabledConfig = Extract<McpConfig, { enabled: true }>

export type McpBearerToken = {
  claims: AccessTokenClaims
  scopes: McpScope[]
}

export type McpBearerResult =
  | { ok: true; token: McpBearerToken }
  | { ok: false; response: Response }

type ChallengeInput = {
  error: "invalid_token" | "insufficient_scope"
  description: string
  status: 401 | 403
  scope?: string
}

function quote(value: string) {
  // Only used for values we control (fixed strings and configured URLs), so
  // escaping the quote character is enough to keep the header well-formed.
  return `"${value.replace(/"/g, '\\"')}"`
}

/**
 * RFC 9728 section 5.1: the `WWW-Authenticate` challenge is how a client that
 * has never seen this server finds the Protected Resource Metadata, and from
 * there the authorization server.
 */
export function buildAuthenticateHeader(
  config: EnabledConfig,
  challenge?: ChallengeInput
) {
  const parameters = [
    `realm=${quote("home-overview-mcp")}`,
    `resource_metadata=${quote(protectedResourceMetadataUrl(config))}`,
  ]

  if (challenge) {
    parameters.push(`error=${quote(challenge.error)}`)
    parameters.push(`error_description=${quote(challenge.description)}`)

    if (challenge.scope) {
      parameters.push(`scope=${quote(challenge.scope)}`)
    }
  }

  return `Bearer ${parameters.join(", ")}`
}

export function authenticationChallengeResponse(
  config: EnabledConfig,
  challenge: ChallengeInput
) {
  return Response.json(
    {
      error: challenge.error,
      error_description: challenge.description,
    },
    {
      status: challenge.status,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": buildAuthenticateHeader(config, challenge),
      },
    }
  )
}

/**
 * Every rejection reason maps to the same client-visible message. Telling a
 * caller whether a token was forged, expired or aimed at another audience only
 * helps someone probing the endpoint; the reason is logged instead.
 */
const INVALID_TOKEN_DESCRIPTION =
  "Access-tokenet mangler, er ugyldig eller er utløpt."

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")
  if (!header) {
    return null
  }

  // RFC 7235: the scheme is case-insensitive.
  const [scheme, ...rest] = header.trim().split(/\s+/)
  if (scheme?.toLowerCase() !== "bearer" || rest.length !== 1) {
    return null
  }

  return rest[0] ?? null
}

export function authenticateMcpRequest(
  request: Request,
  config: EnabledConfig,
  now = new Date()
):
  | { ok: true; token: McpBearerToken }
  | { ok: false; reason: AccessTokenVerificationFailure | "missing-token" } {
  const token = extractBearerToken(request)
  if (!token) {
    return { ok: false, reason: "missing-token" }
  }

  const verification = verifyAccessToken({
    token,
    issuer: config.issuer,
    resource: config.resource,
    signingSecret: config.signingSecret,
    clockSkewSeconds: config.clockSkewSeconds,
    now,
  })

  if (!verification.ok) {
    return { ok: false, reason: verification.reason }
  }

  return {
    ok: true,
    token: { claims: verification.claims, scopes: verification.scopes },
  }
}

export function invalidTokenResponse(config: EnabledConfig) {
  return authenticationChallengeResponse(config, {
    error: "invalid_token",
    description: INVALID_TOKEN_DESCRIPTION,
    status: 401,
  })
}

export function insufficientScopeResponse(
  config: EnabledConfig,
  requiredScope: string
) {
  return authenticationChallengeResponse(config, {
    error: "insufficient_scope",
    description: `Tokenet mangler nødvendig scope: ${requiredScope}.`,
    status: 403,
    scope: requiredScope,
  })
}
