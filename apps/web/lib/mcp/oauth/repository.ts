import { db } from "@workspace/db"

import type { McpConfig } from "../config"
import { McpOAuthTokenRepository } from "./token-repository"

type EnabledConfig = Extract<McpConfig, { enabled: true }>

/**
 * One repository per configuration, hashing every opaque token with the MCP
 * signing secret. Rotating that secret therefore invalidates authorization
 * codes and refresh tokens as well as access tokens, which is exactly what the
 * incident procedure in the runbook expects.
 */
export function createOAuthTokenRepository(config: EnabledConfig) {
  return new McpOAuthTokenRepository(db, { hashSecret: config.signingSecret })
}
