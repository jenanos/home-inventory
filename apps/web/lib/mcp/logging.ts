/**
 * Structured request logging for `/api/mcp`.
 *
 * What is deliberately absent is as important as what is here: no bearer token,
 * no authorization header, no tool arguments and no tool results. Chapter 13.1
 * allows the internal user id, the client id and the tool name — enough to
 * follow one client's traffic without reproducing household data in the logs.
 */

export type McpRequestLogEvent = {
  correlationId: string
  /** JSON-RPC method, e.g. `tools/call`. Null when the body was unreadable. */
  method: string | null
  /** Tool name for `tools/call`, otherwise null. */
  toolName: string | null
  outcome:
    | "ok"
    | "tool_error"
    | "unauthenticated"
    | "forbidden"
    | "rate_limited"
    | "bad_request"
    | "unavailable"
  status: number
  durationMs: number
  responseBytes: number | null
  clientId: string | null
  userId: string | null
  /** Verification failure reason or application error code, never a message. */
  reason?: string
}

export type McpLogger = (event: McpRequestLogEvent) => void

const defaultLogger: McpLogger = (event) => {
  const line = JSON.stringify({ event: "mcp.request", ...event })

  if (event.outcome === "ok" || event.outcome === "tool_error") {
    console.info(line)
  } else {
    console.warn(line)
  }
}

let logger: McpLogger = defaultLogger

export function logMcpRequest(event: McpRequestLogEvent) {
  logger(event)
}

/** Test seam. Passing no logger restores the console default. */
export function setMcpLogger(next: McpLogger | null) {
  logger = next ?? defaultLogger
}

type ParsedEnvelope = {
  method: string | null
  toolName: string | null
}

/**
 * Reads only the routing fields out of a JSON-RPC body. Tool arguments are
 * never touched, so nothing loggable can come from them.
 */
export function describeJsonRpcBody(body: string): ParsedEnvelope {
  try {
    const parsed: unknown = JSON.parse(body)
    const message = Array.isArray(parsed) ? parsed[0] : parsed

    if (typeof message !== "object" || message === null) {
      return { method: null, toolName: null }
    }

    const record = message as Record<string, unknown>
    const method = typeof record.method === "string" ? record.method : null
    const params =
      typeof record.params === "object" && record.params !== null
        ? (record.params as Record<string, unknown>)
        : null
    const toolName =
      method === "tools/call" && typeof params?.name === "string"
        ? params.name
        : null

    return { method, toolName }
  } catch {
    return { method: null, toolName: null }
  }
}
