import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js"

export const MCP_SERVER_NAME = "home-overview"
export const MCP_SERVER_VERSION = "0.10.0"
export const MCP_PROTOCOL_VERSION = LATEST_PROTOCOL_VERSION
export const MCP_MAX_REQUEST_BYTES = 64 * 1024

/**
 * Conservative page sizes. A client that wants more must page explicitly, so a
 * single `tools/call` can never pull a whole household into one response.
 */
export const MCP_DEFAULT_PAGE_SIZE = 25
export const MCP_MAX_PAGE_SIZE = 100

/** Free-text filters are bounded so they cannot become expensive scans. */
export const MCP_MAX_FILTER_LENGTH = 100

export const MCP_DOMAINS = [
  "shopping",
  "budget",
  "maintenance",
  "garden",
] as const

export type McpDomain = (typeof MCP_DOMAINS)[number]
