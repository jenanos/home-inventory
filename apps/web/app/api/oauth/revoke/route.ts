import { createMcpUnavailableResponse, mcpConfig } from "@/lib/mcp/config"
import { OAuthError, oauthErrorResponse } from "@/lib/mcp/oauth/errors"
import {
  enforceOAuthRateLimit,
  rateLimitedResponse,
  rateLimitKeyFromRequest,
} from "@/lib/mcp/oauth/rate-limit"
import { readFormBody } from "@/lib/mcp/oauth/request-body"
import { createOAuthTokenRepository } from "@/lib/mcp/oauth/repository"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * RFC 7009 token revocation.
 *
 * Only refresh tokens are revocable. Access tokens are self-contained JWTs
 * with a short lifetime and are not tracked server-side; the runbook documents
 * that an access token stays valid until it expires. Revoking a refresh token
 * takes down its whole rotation family, so no descendant survives.
 */
export async function POST(request: Request) {
  if (!mcpConfig.enabled) {
    return createMcpUnavailableResponse()
  }

  const rateLimit = enforceOAuthRateLimit(
    "revoke",
    rateLimitKeyFromRequest(request)
  )
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit)
  }

  try {
    const form = await readFormBody(request)
    const token = form.get("token")

    if (!token) {
      throw new OAuthError("invalid_request", "token er påkrevd.", 400)
    }

    const hint = form.get("token_type_hint")
    if (hint && hint !== "refresh_token" && hint !== "access_token") {
      throw new OAuthError(
        "unsupported_token_type",
        "token_type_hint må være refresh_token eller access_token.",
        400
      )
    }

    const repository = createOAuthTokenRepository(mcpConfig)
    const result = await repository.revokeRefreshTokenFamily(token)

    if (result.revoked > 0) {
      console.info("[mcp-oauth] refresh token family revoked", {
        grantId: result.grantId,
        revoked: result.revoked,
      })
    }

    // RFC 7009 section 2.2: an unknown or already invalid token is still a
    // successful revocation, so a caller cannot probe for valid tokens.
    return new Response(null, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (error instanceof OAuthError) {
      return oauthErrorResponse(error)
    }

    console.error("[mcp-oauth] revoke endpoint failed", error)
    return oauthErrorResponse(
      new OAuthError("server_error", "Kunne ikke tilbakekalle tokenet.", 500)
    )
  }
}
