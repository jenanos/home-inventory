import { describe, expect, it } from "vitest"

import { MCP_PROTOCOL_VERSION } from "../../../lib/mcp/constants"
import type { McpSpikeConfig } from "../../../lib/mcp/spike-auth"

import { handleMcpPostRequest, handleUnsupportedMcpMethod } from "./route"

const enabledConfig: McpSpikeConfig = {
  enabled: true,
  token: "test-token",
}

function mcpRequest(body: unknown, extraHeaders: HeadersInit = {}) {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

describe("phase 0 MCP route", () => {
  it("is disabled in production even when a spike token is present", async () => {
    const response = await handleMcpPostRequest(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "ping" }),
      { enabled: false, reason: "production" }
    )

    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("requires the local bearer token", async () => {
    const response = await handleMcpPostRequest(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { Authorization: "Bearer wrong-token" }
      ),
      enabledConfig
    )

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain("Bearer")
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
      enabledConfig
    )
    const result = await readJson(response)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(response.headers.get("mcp-session-id")).toBeNull()
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(result).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: {
          name: "home-overview",
          version: "0.1.0-spike",
        },
      },
    })
  })

  it.each([
    ["ping", undefined],
    ["tools/list", {}],
  ])("handles %s without server-side session state", async (method, params) => {
    const response = await handleMcpPostRequest(
      mcpRequest({
        jsonrpc: "2.0",
        id: 2,
        method,
        ...(params ? { params } : {}),
      }),
      enabledConfig
    )
    const result = await readJson(response)

    expect(response.status).toBe(200)
    expect(result).toMatchObject({ jsonrpc: "2.0", id: 2 })
    expect(result.error).toBeUndefined()
  })

  it("lists and calls get-server-info", async () => {
    const listResponse = await handleMcpPostRequest(
      mcpRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/list",
        params: {},
      }),
      enabledConfig
    )
    const listResult = await readJson(listResponse)

    expect(listResult).toMatchObject({
      result: {
        tools: [
          {
            name: "get-server-info",
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
            },
          },
        ],
      },
    })

    const callResponse = await handleMcpPostRequest(
      mcpRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "get-server-info", arguments: {} },
      }),
      enabledConfig
    )
    const callResult = await readJson(callResponse)

    expect(callResult).toMatchObject({
      result: {
        structuredContent: {
          serverName: "home-overview",
          protocolVersion: MCP_PROTOCOL_VERSION,
          transport: "streamable-http",
          responseMode: "json",
          sessionMode: "stateless",
          availableDomains: ["shopping", "budget", "maintenance", "garden"],
        },
      },
    })
  })

  it("authenticates unsupported GET and DELETE methods before returning 405", async () => {
    const unauthorized = await handleUnsupportedMcpMethod(
      new Request("http://localhost/api/mcp"),
      enabledConfig
    )
    const authorized = await handleUnsupportedMcpMethod(
      new Request("http://localhost/api/mcp", {
        headers: { Authorization: "Bearer test-token" },
      }),
      enabledConfig
    )

    expect(unauthorized.status).toBe(401)
    expect(authorized.status).toBe(405)
    expect(authorized.headers.get("allow")).toBe("POST")
  })
})
