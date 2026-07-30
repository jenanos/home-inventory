import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import {
  createMcpUnavailableResponse,
  mcpConfig,
} from "../../../lib/mcp/config"
import { MCP_MAX_REQUEST_BYTES } from "../../../lib/mcp/constants"
import { createMcpServer } from "../../../lib/mcp/server"
import {
  isMcpSpikeAuthorized,
  loadMcpSpikeConfig,
  type McpSpikeConfig,
} from "../../../lib/mcp/spike-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const spikeConfig = loadMcpSpikeConfig()

function jsonResponse(
  body: unknown,
  init: ResponseInit & { headers?: HeadersInit } = {}
) {
  const headers = new Headers(init.headers)
  headers.set("Cache-Control", "no-store")
  headers.set("Content-Type", "application/json")

  return Response.json(body, { ...init, headers })
}

function disabledResponse(config: Extract<McpSpikeConfig, { enabled: false }>) {
  if (config.reason === "production" && !mcpConfig.enabled) {
    return createMcpUnavailableResponse()
  }

  return jsonResponse(
    {
      error: "MCP_DISABLED",
      message:
        config.reason === "production"
          ? "The phase 0 MCP spike is never available in production."
          : "Set HOME_OVERVIEW_MCP_SPIKE_TOKEN to enable the local MCP spike.",
    },
    { status: 503 }
  )
}

function unauthorizedResponse() {
  return jsonResponse(
    {
      error: "UNAUTHORIZED",
      message: "A valid local phase 0 bearer token is required.",
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="home-overview-mcp-spike"',
      },
    }
  )
}

function authorize(request: Request, config: McpSpikeConfig) {
  if (!config.enabled) {
    return disabledResponse(config)
  }

  if (!isMcpSpikeAuthorized(request, config)) {
    return unauthorizedResponse()
  }
}

export async function handleMcpPostRequest(
  request: Request,
  config: McpSpikeConfig
) {
  const authorizationError = authorize(request, config)
  if (authorizationError) {
    return authorizationError
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]
  if (contentType?.trim().toLowerCase() !== "application/json") {
    return jsonResponse(
      {
        error: "UNSUPPORTED_MEDIA_TYPE",
        message: "The MCP endpoint accepts application/json only.",
      },
      { status: 415 }
    )
  }

  const contentLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > MCP_MAX_REQUEST_BYTES) {
    return jsonResponse(
      {
        error: "REQUEST_TOO_LARGE",
        message: `The MCP request limit is ${MCP_MAX_REQUEST_BYTES} bytes.`,
      },
      { status: 413 }
    )
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  const server = createMcpServer()

  await server.connect(transport)
  const response = await transport.handleRequest(request)
  const headers = new Headers(response.headers)
  headers.set("Cache-Control", "no-store")

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function handleUnsupportedMcpMethod(
  request: Request,
  config: McpSpikeConfig
) {
  const authorizationError = authorize(request, config)
  if (authorizationError) {
    return authorizationError
  }

  return jsonResponse(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "Method not allowed. This stateless server supports POST only.",
      },
      id: null,
    },
    {
      status: 405,
      headers: { Allow: "POST" },
    }
  )
}

export async function POST(request: Request) {
  return handleMcpPostRequest(request, spikeConfig)
}

export async function GET(request: Request) {
  return handleUnsupportedMcpMethod(request, spikeConfig)
}

export async function DELETE(request: Request) {
  return handleUnsupportedMcpMethod(request, spikeConfig)
}
