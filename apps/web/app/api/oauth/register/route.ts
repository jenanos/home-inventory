import { createMcpUnavailableResponse, mcpConfig } from "@/lib/mcp/config"
import { validateClientMetadata } from "@/lib/mcp/oauth/client-metadata"
import { clientRegistry } from "@/lib/mcp/oauth/client-registry"
import { OAuthError, oauthErrorResponse } from "@/lib/mcp/oauth/errors"
import {
  enforceOAuthRateLimit,
  rateLimitedResponse,
  rateLimitKeyFromRequest,
} from "@/lib/mcp/oauth/rate-limit"
import { readJsonBody } from "@/lib/mcp/oauth/request-body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * RFC 7591 dynamic client registration.
 *
 * Client ID Metadata Documents are the preferred mechanism (ADR 0001); this
 * endpoint exists as the documented fallback for clients that do not support
 * them (ADR 0002). Registration is open, so it is bounded on every axis that
 * matters: per-IP rate limit, body size, redirect-URI count and scheme, name
 * length, and a global cap on active registrations. Registrations that are
 * never taken into use expire and are removed by the cleanup job.
 */
export async function POST(request: Request) {
  if (!mcpConfig.enabled) {
    return createMcpUnavailableResponse()
  }

  const rateLimit = enforceOAuthRateLimit(
    "register",
    rateLimitKeyFromRequest(request)
  )
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit)
  }

  try {
    const body = await readJsonBody(request)
    const validation = validateClientMetadata(body)

    if (!validation.ok) {
      throw new OAuthError(
        "invalid_client_metadata",
        validation.rejection.message,
        400
      )
    }

    const client = await clientRegistry.registerDynamicClient(
      validation.metadata
    )

    console.info("[mcp-oauth] dynamic client registered", {
      clientId: client.id,
    })

    return Response.json(
      {
        client_id: client.id,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: client.grantTypes,
        response_types: client.responseTypes,
        // A public client: no secret is issued, so nothing has to be stored
        // secretly by the client and nothing can leak from this response.
        token_endpoint_auth_method: "none",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof OAuthError) {
      return oauthErrorResponse(error)
    }

    console.error("[mcp-oauth] client registration failed", error)
    return oauthErrorResponse(
      new OAuthError("server_error", "Kunne ikke registrere klienten.", 500)
    )
  }
}
