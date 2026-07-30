import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js"

export const MCP_SERVER_NAME = "home-overview"
export const MCP_SERVER_VERSION = "0.1.0-spike"
export const MCP_PROTOCOL_VERSION = LATEST_PROTOCOL_VERSION
export const MCP_SPIKE_TOKEN_ENV = "HOME_OVERVIEW_MCP_SPIKE_TOKEN"
export const MCP_MAX_REQUEST_BYTES = 64 * 1024

export const MCP_DOMAINS = [
  "shopping",
  "budget",
  "maintenance",
  "garden",
] as const
