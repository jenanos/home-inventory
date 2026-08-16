import { randomUUID } from "node:crypto"

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { isApplicationError } from "@/lib/application/errors"
import {
  authenticateMcpRequest,
  buildAuthenticateHeader,
  invalidTokenResponse,
} from "@/lib/mcp/auth/bearer"
import { createMcpSession, type McpSession } from "@/lib/mcp/auth/session"
import {
  createMcpUnavailableResponse,
  mcpConfig,
  type McpConfig,
} from "@/lib/mcp/config"
import { MCP_MAX_REQUEST_BYTES } from "@/lib/mcp/constants"
import {
  describeJsonRpcBody,
  logMcpRequest,
  type McpRequestLogEvent,
} from "@/lib/mcp/logging"
import {
  enforceMcpRateLimit,
  rateLimitedResponse,
  rateLimitKeyFromRequest,
} from "@/lib/mcp/oauth/rate-limit"
import { createMcpServer } from "@/lib/mcp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type EnabledConfig = Extract<McpConfig, { enabled: true }>

export type McpRouteDependencies = {
  config: McpConfig
  createSession?: typeof createMcpSession
  createServer?: (session: McpSession) => ReturnType<typeof createMcpServer>
  now?: () => Date
}

type LogDraft = Omit<McpRequestLogEvent, "durationMs" | "responseBytes">

type AuthenticationResult =
  | { ok: true; session: McpSession; clientId: string; userId: string }
  | {
      ok: false
      response: Response
      outcome: LogDraft["outcome"]
      reason: string
      clientId: string | null
      userId: string | null
    }

function jsonResponse(
  body: unknown,
  init: ResponseInit & { headers?: HeadersInit } = {}
) {
  const headers = new Headers(init.headers)
  headers.set("Cache-Control", "no-store")

  return Response.json(body, { ...init, headers })
}

function withCorrelation(response: Response, correlationId: string) {
  const headers = new Headers(response.headers)
  headers.set("Cache-Control", "no-store")
  headers.set("X-Correlation-Id", correlationId)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Authentication for every method on this route. `GET` and `DELETE` go through
 * the same check as `POST` so an unauthenticated caller cannot learn which
 * methods exist.
 */
async function authenticate(
  request: Request,
  config: EnabledConfig,
  dependencies: McpRouteDependencies
): Promise<AuthenticationResult> {
  const verification = authenticateMcpRequest(
    request,
    config,
    dependencies.now?.()
  )

  if (!verification.ok) {
    return {
      ok: false,
      response: invalidTokenResponse(config),
      outcome: "unauthenticated",
      reason: verification.reason,
      clientId: null,
      userId: null,
    }
  }

  const { claims, scopes } = verification.token
  const createSession = dependencies.createSession ?? createMcpSession

  try {
    const session = await createSession({
      userId: claims.sub,
      clientId: claims.client_id,
      tokenId: claims.jti,
      scopes,
    })

    return {
      ok: true,
      session,
      clientId: claims.client_id,
      userId: claims.sub,
    }
  } catch (error) {
    // A token can outlive its user: the account may be deleted or removed from
    // the household between issuing and use. The membership is re-read here on
    // every request precisely so that takes effect immediately.
    if (isApplicationError(error)) {
      return {
        ok: false,
        response: jsonResponse(
          { error: error.code, error_description: error.message },
          { status: 403 }
        ),
        outcome: "forbidden",
        reason: error.code,
        clientId: claims.client_id,
        userId: claims.sub,
      }
    }

    throw error
  }
}

async function readBody(request: Request) {
  const body = await request.text()
  const bytes = Buffer.byteLength(body, "utf8")

  return { body, bytes }
}

export async function handleMcpPostRequest(
  request: Request,
  dependencies: McpRouteDependencies
): Promise<Response> {
  const startedAt = Date.now()
  const correlationId = randomUUID()

  const finish = (
    response: Response,
    draft: Omit<LogDraft, "correlationId" | "status">,
    responseBytes: number | null = null
  ) => {
    logMcpRequest({
      correlationId,
      status: response.status,
      durationMs: Date.now() - startedAt,
      responseBytes,
      ...draft,
    })

    return withCorrelation(response, correlationId)
  }

  const config = dependencies.config
  if (!config.enabled) {
    return finish(createMcpUnavailableResponse(), {
      method: null,
      toolName: null,
      outcome: "unavailable",
      clientId: null,
      userId: null,
      reason: config.reason,
    })
  }

  const addressLimit = enforceMcpRateLimit(
    "mcpAddress",
    rateLimitKeyFromRequest(request)
  )
  if (!addressLimit.allowed) {
    return finish(rateLimitedResponse(addressLimit), {
      method: null,
      toolName: null,
      outcome: "rate_limited",
      clientId: null,
      userId: null,
      reason: "address",
    })
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]
  if (contentType?.trim().toLowerCase() !== "application/json") {
    return finish(
      jsonResponse(
        {
          error: "unsupported_media_type",
          error_description: "The MCP endpoint accepts application/json only.",
        },
        { status: 415 }
      ),
      {
        method: null,
        toolName: null,
        outcome: "bad_request",
        clientId: null,
        userId: null,
        reason: "content-type",
      }
    )
  }

  const authentication = await authenticate(request, config, dependencies)
  if (!authentication.ok) {
    return finish(authentication.response, {
      method: null,
      toolName: null,
      outcome: authentication.outcome,
      clientId: authentication.clientId,
      userId: authentication.userId,
      reason: authentication.reason,
    })
  }

  const { session, clientId, userId } = authentication

  const tokenLimit = enforceMcpRateLimit("mcpToken", session.context.userId)
  if (!tokenLimit.allowed) {
    return finish(rateLimitedResponse(tokenLimit), {
      method: null,
      toolName: null,
      outcome: "rate_limited",
      clientId,
      userId,
      reason: "token",
    })
  }

  // The body is read here rather than handed straight to the transport so the
  // real byte count can be enforced (a lying `content-length` proves nothing)
  // and so the JSON-RPC method can be logged. Tool arguments are never read.
  const { body, bytes } = await readBody(request)
  if (bytes > MCP_MAX_REQUEST_BYTES) {
    return finish(
      jsonResponse(
        {
          error: "request_too_large",
          error_description: `The MCP request limit is ${MCP_MAX_REQUEST_BYTES} bytes.`,
        },
        { status: 413 }
      ),
      {
        method: null,
        toolName: null,
        outcome: "bad_request",
        clientId,
        userId,
        reason: "request-too-large",
      }
    )
  }

  const envelope = describeJsonRpcBody(body)

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  const server = (dependencies.createServer ?? createServerForSession)(session)

  await server.connect(transport)

  const response = await transport.handleRequest(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body,
    })
  )

  // JSON response mode never streams, so buffering to measure the size and to
  // classify the outcome is safe.
  const responseBody = await response.text()

  return finish(
    new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
    {
      method: envelope.method,
      toolName: envelope.toolName,
      outcome: response.ok
        ? classifyJsonRpcOutcome(responseBody)
        : "bad_request",
      clientId,
      userId,
    },
    Buffer.byteLength(responseBody, "utf8")
  )
}

/**
 * Distinguishes a tool that reported a domain failure from a clean call. Only
 * the `isError` flag is inspected — never the result payload, which is
 * household data.
 */
function classifyJsonRpcOutcome(body: string): "ok" | "tool_error" {
  try {
    const parsed: unknown = JSON.parse(body)
    const messages = Array.isArray(parsed) ? parsed : [parsed]

    for (const message of messages) {
      if (typeof message !== "object" || message === null) {
        continue
      }

      const record = message as Record<string, unknown>
      const result = record.result as Record<string, unknown> | undefined

      if (record.error || result?.isError === true) {
        return "tool_error"
      }
    }

    return "ok"
  } catch {
    return "ok"
  }
}

function createServerForSession(session: McpSession) {
  return createMcpServer({ session })
}

export async function handleUnsupportedMcpMethod(
  request: Request,
  dependencies: McpRouteDependencies
): Promise<Response> {
  const config = dependencies.config
  if (!config.enabled) {
    return createMcpUnavailableResponse()
  }

  // Same limit as POST: authentication costs a database lookup, so an
  // unsupported method must not be a cheaper way to reach it.
  const addressLimit = enforceMcpRateLimit(
    "mcpAddress",
    rateLimitKeyFromRequest(request)
  )
  if (!addressLimit.allowed) {
    return rateLimitedResponse(addressLimit)
  }

  const authentication = await authenticate(request, config, dependencies)
  if (!authentication.ok) {
    return authentication.response
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
      headers: {
        Allow: "POST",
        "WWW-Authenticate": buildAuthenticateHeader(config),
      },
    }
  )
}

export async function POST(request: Request) {
  return handleMcpPostRequest(request, { config: mcpConfig })
}

export async function GET(request: Request) {
  return handleUnsupportedMcpMethod(request, { config: mcpConfig })
}

export async function DELETE(request: Request) {
  return handleUnsupportedMcpMethod(request, { config: mcpConfig })
}
