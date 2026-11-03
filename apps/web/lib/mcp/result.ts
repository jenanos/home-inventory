import { randomUUID } from "node:crypto"

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import {
  isApplicationError,
  type ApplicationErrorCode,
} from "../application/errors"

/**
 * Every tool answers with both a machine-readable `structuredContent` and a
 * short human-readable `content`, and the two must agree. The text is a summary
 * for the model, never a second source of truth.
 */
export function toolSuccess(
  structuredContent: Record<string, unknown>,
  summary: string
): CallToolResult {
  return {
    structuredContent,
    content: [{ type: "text", text: summary }],
  }
}

export type ToolErrorPayload = {
  code: ApplicationErrorCode
  message: string
  correlationId?: string
}

export function toolError(payload: ToolErrorPayload): CallToolResult {
  const suffix = payload.correlationId
    ? ` (referanse: ${payload.correlationId})`
    : ""

  return {
    isError: true,
    structuredContent: { error: payload },
    content: [
      {
        type: "text",
        text: `${payload.code}: ${payload.message}${suffix}`,
      },
    ],
  }
}

export type ToolErrorLogger = (event: {
  correlationId: string
  toolName: string
  error: unknown
}) => void

const defaultLogger: ToolErrorLogger = ({ correlationId, toolName, error }) => {
  console.error("[mcp] tool failed", { correlationId, toolName }, error)
}

/**
 * Expected domain failures keep their stable code and their actionable message.
 * Anything else — a Prisma failure, a bug — is logged with a correlation id and
 * reported as a generic internal error, so no stack trace, SQL or internal
 * input ever reaches the client.
 */
export function toolErrorFromException(
  error: unknown,
  toolName: string,
  log: ToolErrorLogger = defaultLogger
): CallToolResult {
  if (isApplicationError(error)) {
    return toolError({ code: error.code, message: error.message })
  }

  const correlationId = randomUUID()
  log({ correlationId, toolName, error })

  return toolError({
    code: "INTERNAL_ERROR",
    message: "En uventet feil oppstod. Prøv igjen senere.",
    correlationId,
  })
}

/**
 * Unknown ids and resources the caller may not see must be indistinguishable,
 * so both go through this one message.
 */
export function notFoundError(resource: string): CallToolResult {
  return toolError({
    code: "NOT_FOUND",
    message: `Fant ingen ${resource} med den ID-en.`,
  })
}

export function scopeRequiredError(scope: string): CallToolResult {
  return toolError({
    code: "SCOPE_REQUIRED",
    message: `Dette verktøyet krever scope ${scope}.`,
  })
}
