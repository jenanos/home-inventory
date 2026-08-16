import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import type { McpSession } from "./auth/session"
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./constants"
import { createToolRegistry, type McpToolDefinition } from "./tools"

type McpServerDependencies = {
  session: McpSession
  now?: () => Date
  tools?: McpToolDefinition[]
}

/**
 * Builds a server for exactly one request. The transport is stateless, so a
 * fresh instance per request is not overhead we are avoiding — it is what lets
 * the tool list be shaped by this token's scopes.
 *
 * Out-of-scope tools are registered and then disabled rather than skipped: the
 * scope guard inside each tool still runs on `tools/call`, so filtering the
 * list is presentation, not the security boundary.
 */
export function createMcpServer({
  session,
  now = () => new Date(),
  tools = createToolRegistry(now),
}: McpServerDependencies) {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  })

  for (const tool of tools) {
    const registered = tool.register(server, session)

    if (tool.scope !== null && !session.scopes.includes(tool.scope)) {
      registered.disable()
    }
  }

  return server
}
