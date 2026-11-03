import type { McpConfig } from "../config"
import { enabledScopes } from "./scopes"
import { SUPPORTED_CODE_CHALLENGE_METHODS } from "./pkce"
import {
  SUPPORTED_GRANT_TYPES,
  SUPPORTED_RESPONSE_TYPES,
  SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS,
} from "./client-metadata"

type EnabledConfig = Extract<McpConfig, { enabled: true }>

export const OAUTH_ENDPOINT_PATHS = {
  authorize: "/api/oauth/authorize",
  decision: "/api/oauth/authorize/decision",
  token: "/api/oauth/token",
  register: "/api/oauth/register",
  revoke: "/api/oauth/revoke",
  consent: "/oauth/consent",
} as const

export function oauthEndpointUrl(
  config: EnabledConfig,
  endpoint: keyof typeof OAUTH_ENDPOINT_PATHS
) {
  return `${config.issuer}${OAUTH_ENDPOINT_PATHS[endpoint]}`
}

export const PROTECTED_RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource/api/mcp"

export function protectedResourceMetadataUrl(config: EnabledConfig) {
  return `${config.issuer}${PROTECTED_RESOURCE_METADATA_PATH}`
}

/** RFC 9728. */
export function buildProtectedResourceMetadata(config: EnabledConfig) {
  return {
    resource: config.resource,
    resource_name: "Home Overview",
    authorization_servers: [config.issuer],
    scopes_supported: enabledScopes(config.writeDomains),
    bearer_methods_supported: ["header"],
  }
}

/**
 * RFC 8414. Only implemented capabilities are advertised: no implicit flow, no
 * client credentials, no `plain` PKCE, and no scope that is not enforced.
 */
export function buildAuthorizationServerMetadata(config: EnabledConfig) {
  return {
    issuer: config.issuer,
    authorization_endpoint: oauthEndpointUrl(config, "authorize"),
    token_endpoint: oauthEndpointUrl(config, "token"),
    registration_endpoint: oauthEndpointUrl(config, "register"),
    revocation_endpoint: oauthEndpointUrl(config, "revoke"),
    scopes_supported: enabledScopes(config.writeDomains),
    response_types_supported: [...SUPPORTED_RESPONSE_TYPES],
    response_modes_supported: ["query"],
    grant_types_supported: [...SUPPORTED_GRANT_TYPES],
    code_challenge_methods_supported: [...SUPPORTED_CODE_CHALLENGE_METHODS],
    token_endpoint_auth_methods_supported: [
      ...SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS,
    ],
    revocation_endpoint_auth_methods_supported: [
      ...SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS,
    ],
    client_id_metadata_document_supported: true,
    resource_indicators_supported: true,
    authorization_response_iss_parameter_supported: true,
  }
}

/**
 * Discovery documents are public and stable, but short-lived caching keeps a
 * configuration change from being pinned by an intermediary for long.
 */
export function metadataResponse(body: unknown) {
  return Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json",
    },
  })
}
