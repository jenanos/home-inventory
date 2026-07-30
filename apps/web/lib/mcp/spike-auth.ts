import { timingSafeEqual } from "node:crypto"

import { MCP_SPIKE_TOKEN_ENV } from "./constants"

type McpSpikeDisabledReason = "missing-token" | "production"

export type McpSpikeConfig =
  | {
      enabled: true
      token: string
    }
  | {
      enabled: false
      reason: McpSpikeDisabledReason
    }

type McpSpikeEnvironment = {
  NODE_ENV?: string
  HOME_OVERVIEW_MCP_SPIKE_TOKEN?: string
}

export function loadMcpSpikeConfig(
  environment: McpSpikeEnvironment = process.env
): McpSpikeConfig {
  if (environment.NODE_ENV === "production") {
    return { enabled: false, reason: "production" }
  }

  const token = environment[MCP_SPIKE_TOKEN_ENV]?.trim()
  if (!token) {
    return { enabled: false, reason: "missing-token" }
  }

  return { enabled: true, token }
}

function tokensMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

export function isMcpSpikeAuthorized(request: Request, config: McpSpikeConfig) {
  if (!config.enabled) {
    return false
  }

  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) {
    return false
  }

  return tokensMatch(authorization.slice("Bearer ".length), config.token)
}
