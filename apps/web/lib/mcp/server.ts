import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import {
  MCP_DOMAINS,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "./constants"

type McpServerDependencies = {
  now?: () => Date
}

const serverInfoSchema = {
  serverName: z.string(),
  serverVersion: z.string(),
  protocolVersion: z.string(),
  transport: z.literal("streamable-http"),
  responseMode: z.literal("json"),
  sessionMode: z.literal("stateless"),
  availableDomains: z.array(z.enum(MCP_DOMAINS)),
  currentTime: z.string().datetime(),
}

export function createMcpServer({
  now = () => new Date(),
}: McpServerDependencies = {}) {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  })

  server.registerTool(
    "get-server-info",
    {
      title: "Get server information",
      description:
        "Returns protocol and deployment metadata for diagnostics. It does not return household or user data.",
      inputSchema: {},
      outputSchema: serverInfoSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const result = {
        serverName: MCP_SERVER_NAME,
        serverVersion: MCP_SERVER_VERSION,
        protocolVersion: MCP_PROTOCOL_VERSION,
        transport: "streamable-http" as const,
        responseMode: "json" as const,
        sessionMode: "stateless" as const,
        availableDomains: [...MCP_DOMAINS],
        currentTime: now().toISOString(),
      }

      return {
        structuredContent: result,
        content: [
          {
            type: "text",
            text: `${MCP_SERVER_NAME} ${MCP_SERVER_VERSION} uses MCP ${MCP_PROTOCOL_VERSION} over stateless Streamable HTTP.`,
          },
        ],
      }
    }
  )

  return server
}
