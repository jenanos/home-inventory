import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ApplicationContext } from "@/lib/application/context"
import { HouseholdMembershipRequiredError } from "@/lib/application/errors"
import type { McpSession } from "@/lib/mcp/auth/session"
import type { McpConfig } from "@/lib/mcp/config"
import {
  MCP_MAX_REQUEST_BYTES,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_VERSION,
} from "@/lib/mcp/constants"
import { setMcpLogger, type McpRequestLogEvent } from "@/lib/mcp/logging"
import { issueAccessToken } from "@/lib/mcp/oauth/access-token"
import { resetRateLimitsForTesting } from "@/lib/mcp/oauth/rate-limit"
import { expandEffectiveScopes, type McpScope } from "@/lib/mcp/oauth/scopes"
import { createMcpServer } from "@/lib/mcp/server"
import type { McpToolDefinition } from "@/lib/mcp/tools"

import { handleMcpPostRequest, handleUnsupportedMcpMethod } from "./route"

const config = {
  enabled: true,
  issuer: "https://home.jenanos.xyz",
  resource: "https://home.jenanos.xyz/api/mcp",
  signingSecret: "s".repeat(32),
  accessTokenTtlSeconds: 1800,
  refreshTokenTtlSeconds: 2592000,
  clockSkewSeconds: 30,
} satisfies Extract<McpConfig, { enabled: true }>

const context: ApplicationContext = {
  userId: "user-1",
  householdId: "household-1",
  role: "MEMBER",
}

const toolCalls: Array<{ name: string; scopes: McpScope[] }> = []
let logEvents: McpRequestLogEvent[] = []

/**
 * A stand-in for the real tool set. The route's job is transport, auth and
 * limits; which tools exist is covered by the tool tests.
 */
function stubTools(): McpToolDefinition[] {
  return [
    {
      name: "get-server-info",
      scope: null,
      outputSchema: {},
      register: (server) =>
        server.registerTool(
          "get-server-info",
          { description: "diagnostics", inputSchema: {} },
          async () => ({ content: [{ type: "text" as const, text: "ok" }] })
        ),
      invoke: async () => ({ content: [] }),
    },
    {
      name: "list-plants",
      scope: "garden:read",
      outputSchema: {},
      register: (server, session) =>
        server.registerTool(
          "list-plants",
          { description: "plants", inputSchema: {} },
          async () => {
            toolCalls.push({ name: "list-plants", scopes: session.scopes })
            return { content: [{ type: "text" as const, text: "plants" }] }
          }
        ),
      invoke: async () => ({ content: [] }),
    },
  ]
}

function dependencies(
  overrides: {
    config?: McpConfig
    scopes?: McpScope[]
    loadContext?: () => Promise<ApplicationContext>
  } = {}
) {
  return {
    config: overrides.config ?? config,
    createSession: async (input: {
      userId: string
      clientId: string
      tokenId: string
      scopes: readonly McpScope[]
    }): Promise<McpSession> => {
      const loaded = overrides.loadContext
        ? await overrides.loadContext()
        : context

      return {
        context: loaded,
        scopes: expandEffectiveScopes(input.scopes),
        clientId: input.clientId,
        tokenId: input.tokenId,
      }
    },
    createServer: (session: McpSession) =>
      createMcpServer({ session, tools: stubTools() }),
  }
}

function token(scopes: McpScope[] = ["garden:read"]) {
  return issueAccessToken({
    issuer: config.issuer,
    resource: "https://home.jenanos.xyz/api/mcp",
    signingSecret: "s".repeat(32),
    userId: "user-1",
    clientId: "client-1",
    scopes,
    expiresInSeconds: 900,
  }).token
}

function mcpRequest(
  body: unknown,
  options: { token?: string | null; headers?: HeadersInit } = {}
) {
  const bearer = options.token === undefined ? token() : options.token
  const headers = new Headers({
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    ...options.headers,
  })

  if (bearer) {
    headers.set("Authorization", `Bearer ${bearer}`)
  }

  return new Request("https://home.jenanos.xyz/api/mcp", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

describe("authenticated MCP route", () => {
  beforeEach(() => {
    resetRateLimitsForTesting()
    toolCalls.length = 0
    logEvents = []
    setMcpLogger((event) => logEvents.push(event))
  })

  afterEach(() => {
    setMcpLogger(null)
    vi.useRealTimers()
  })

  it("returns 503 without leaking why when MCP is unconfigured", async () => {
    const response = await handleMcpPostRequest(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "ping" }),
      dependencies({
        config: {
          enabled: false,
          reason: "missing-or-invalid-configuration",
          issues: ["HOME_OVERVIEW_MCP_ISSUER"],
        },
      })
    )

    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    await expect(response.text()).resolves.not.toContain(
      "HOME_OVERVIEW_MCP_ISSUER"
    )
  })

  it("returns 503 when an operator has pulled the emergency switch", async () => {
    const response = await handleMcpPostRequest(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "ping" }),
      dependencies({
        config: { enabled: false, reason: "disabled-by-operator" },
      })
    )

    expect(response.status).toBe(503)
  })

  it.each([
    ["a missing token", null],
    ["a forged token", "not.a.token"],
    [
      "a token signed with another secret",
      issueAccessToken({
        issuer: config.issuer,
        resource: "https://home.jenanos.xyz/api/mcp",
        signingSecret: "x".repeat(32),
        userId: "user-1",
        clientId: "client-1",
        scopes: ["garden:read"],
        expiresInSeconds: 900,
      }).token,
    ],
    [
      "a token for another resource",
      issueAccessToken({
        issuer: config.issuer,
        resource: "https://home.jenanos.xyz/api/other",
        signingSecret: "s".repeat(32),
        userId: "user-1",
        clientId: "client-1",
        scopes: ["garden:read"],
        expiresInSeconds: 900,
      }).token,
    ],
  ])("rejects %s with a 401 pointing at the metadata", async (_case, value) => {
    const response = await handleMcpPostRequest(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "ping" }, { token: value }),
      dependencies()
    )

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://home.jenanos.xyz/.well-known/oauth-protected-resource/api/mcp"'
    )
    expect(response.headers.get("www-authenticate")).toContain(
      'error="invalid_token"'
    )
  })

  it("rejects an expired token", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-03T12:00:00Z"))
    const expiring = token()

    vi.setSystemTime(new Date("2026-08-03T12:20:00Z"))

    const response = await handleMcpPostRequest(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { token: expiring }
      ),
      dependencies()
    )

    expect(response.status).toBe(401)
  })

  it("returns 403 when the token subject is no longer a household member", async () => {
    const response = await handleMcpPostRequest(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "ping" }),
      dependencies({
        loadContext: async () => {
          throw new HouseholdMembershipRequiredError()
        },
      })
    )

    expect(response.status).toBe(403)
    await expect(readJson(response)).resolves.toMatchObject({
      error: "FORBIDDEN",
    })
  })

  it("rejects unknown content types and oversized bodies", async () => {
    const wrongType = await handleMcpPostRequest(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { headers: { "Content-Type": "text/plain" } }
      ),
      dependencies()
    )

    const oversized = await handleMcpPostRequest(
      mcpRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "ping",
        params: { padding: "x".repeat(MCP_MAX_REQUEST_BYTES) },
      }),
      dependencies()
    )

    expect(wrongType.status).toBe(415)
    expect(oversized.status).toBe(413)
  })

  it("initializes over stateless Streamable HTTP with a JSON response", async () => {
    const response = await handleMcpPostRequest(
      mcpRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "vitest", version: "1.0.0" },
        },
      }),
      dependencies()
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("mcp-session-id")).toBeNull()
    expect(response.headers.get("x-correlation-id")).toBeTruthy()
    await expect(readJson(response)).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: { name: "home-overview", version: MCP_SERVER_VERSION },
      },
    })
  })

  it("hides tools the token has no scope for, and still refuses to call them", async () => {
    const listed = await handleMcpPostRequest(
      mcpRequest(
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        { token: token(["shopping:read"]) }
      ),
      dependencies()
    )
    const listResult = (await readJson(listed)) as {
      result: { tools: Array<{ name: string }> }
    }

    expect(listResult.result.tools.map((tool) => tool.name)).toEqual([
      "get-server-info",
    ])

    const called = await handleMcpPostRequest(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "list-plants", arguments: {} },
        },
        { token: token(["shopping:read"]) }
      ),
      dependencies()
    )
    const callResult = (await readJson(called)) as {
      result: { isError?: boolean }
    }

    expect(callResult.result.isError).toBe(true)
    expect(toolCalls).toEqual([])
  })

  it("runs a tool the token does have scope for", async () => {
    const response = await handleMcpPostRequest(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "list-plants", arguments: {} },
        },
        { token: token(["garden:write"]) }
      ),
      dependencies()
    )

    expect(response.status).toBe(200)
    // garden:write implies garden:read, so the read tool is reachable.
    expect(toolCalls).toEqual([
      { name: "list-plants", scopes: ["garden:read", "garden:write"] },
    ])
  })

  it("rate-limits repeated calls and reports Retry-After", async () => {
    const bearer = token()
    let lastStatus = 200

    for (let attempt = 0; attempt < 130 && lastStatus !== 429; attempt += 1) {
      const response = await handleMcpPostRequest(
        mcpRequest(
          { jsonrpc: "2.0", id: attempt, method: "ping" },
          { token: bearer }
        ),
        dependencies()
      )
      lastStatus = response.status

      if (lastStatus === 429) {
        expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0)
      }
    }

    expect(lastStatus).toBe(429)
  })

  it("logs the method and outcome without tokens, arguments or results", async () => {
    await handleMcpPostRequest(
      mcpRequest({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "list-plants", arguments: { secret: "leek" } },
      }),
      dependencies()
    )

    expect(logEvents).toHaveLength(1)
    expect(logEvents[0]).toMatchObject({
      method: "tools/call",
      toolName: "list-plants",
      outcome: "ok",
      status: 200,
      clientId: "client-1",
      userId: "user-1",
    })

    const serialized = JSON.stringify(logEvents[0])
    expect(serialized).not.toContain("leek")
    expect(serialized).not.toContain("Bearer")
  })

  it("authenticates GET and DELETE before answering 405", async () => {
    const unauthorized = await handleUnsupportedMcpMethod(
      new Request("https://home.jenanos.xyz/api/mcp"),
      dependencies()
    )
    const authorized = await handleUnsupportedMcpMethod(
      new Request("https://home.jenanos.xyz/api/mcp", {
        headers: { Authorization: `Bearer ${token()}` },
      }),
      dependencies()
    )

    expect(unauthorized.status).toBe(401)
    expect(authorized.status).toBe(405)
    expect(authorized.headers.get("allow")).toBe("POST")
  })
})
