import { z } from "zod"

import {
  MCP_DOMAINS,
  MCP_MAX_PAGE_SIZE,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "../constants"
import { domainsForScopes, MCP_SCOPES } from "../oauth/scopes"
import { toolSuccess } from "../result"
import { defineTool, READ_ONLY_ANNOTATIONS } from "./define"

export function createServerInfoTool(now: () => Date = () => new Date()) {
  return defineTool({
    name: "get-server-info",
    // Any valid token may call it. It reports capabilities, never data.
    scope: null,
    title: "Get server information",
    description:
      "Returns protocol and deployment metadata plus the scopes this token was granted and which domains it can read and change. Useful for diagnosing why a tool is missing. It returns no household or personal data.",
    inputSchema: {},
    outputSchema: {
      serverName: z.string(),
      serverVersion: z.string(),
      protocolVersion: z.string(),
      transport: z.literal("streamable-http"),
      responseMode: z.literal("json"),
      sessionMode: z.literal("stateless"),
      availableDomains: z
        .array(z.enum(MCP_DOMAINS))
        .describe("Domains this token can currently read."),
      writableDomains: z
        .array(z.enum(MCP_DOMAINS))
        .describe(
          "Domains this token can currently change. Empty when the token has no write scope or the server has writes switched off for those domains."
        ),
      grantedScopes: z
        .array(z.enum(MCP_SCOPES))
        .describe("Effective scopes, with write scopes already implying read."),
      maxPageSize: z.number().int(),
      currentTime: z.string(),
    },
    annotations: READ_ONLY_ANNOTATIONS,
    handler: async (_args, session) => {
      const result = {
        serverName: MCP_SERVER_NAME,
        serverVersion: MCP_SERVER_VERSION,
        protocolVersion: MCP_PROTOCOL_VERSION,
        transport: "streamable-http" as const,
        responseMode: "json" as const,
        sessionMode: "stateless" as const,
        availableDomains: domainsForScopes(session.scopes),
        writableDomains: MCP_DOMAINS.filter((domain) =>
          session.scopes.some((scope) => scope === `${domain}:write`)
        ),
        grantedScopes: session.scopes,
        maxPageSize: MCP_MAX_PAGE_SIZE,
        currentTime: now().toISOString(),
      }

      return toolSuccess(
        result,
        `${MCP_SERVER_NAME} ${MCP_SERVER_VERSION} uses MCP ${MCP_PROTOCOL_VERSION} over stateless Streamable HTTP.`
      )
    },
  })
}
