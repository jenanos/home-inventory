import type {
  McpServer,
  RegisteredTool,
} from "@modelcontextprotocol/sdk/server/mcp.js"
import type {
  CallToolResult,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

import { isApplicationError } from "../../application/errors"
import { recordMcpAuditEvent, type McpAuditOutcome } from "../audit"
import { sessionHasScope, type McpSession } from "../auth/session"
import type { McpScope } from "../oauth/scopes"
import {
  scopeRequiredError,
  toolError,
  toolErrorFromException,
  toolSuccess,
} from "../result"

export type McpToolDefinition = {
  name: string
  /** Scope required to see and call the tool. `null` means any valid token. */
  scope: McpScope | null
  /** Exposed so contract tests can inspect the published input contract. */
  inputSchema: z.ZodRawShape
  /** Exposed so contract tests can validate real responses against it. */
  outputSchema: z.ZodRawShape
  /** Exposed so contract tests can check the hints match the tool's effect. */
  annotations: ToolAnnotations
  register: (server: McpServer, session: McpSession) => RegisteredTool
  /**
   * Runs the tool the way the transport would, including input parsing. Exists
   * so the scope guard can be tested without a server, and so `tools/call`
   * enforcement is provably independent of `tools/list` filtering.
   */
  invoke: (args: unknown, session: McpSession) => Promise<CallToolResult>
}

type ToolInput<TInput extends z.ZodRawShape> = z.infer<z.ZodObject<TInput>>

export function defineTool<
  TInput extends z.ZodRawShape,
  TOutput extends z.ZodRawShape,
>(definition: {
  name: string
  scope: McpScope | null
  title: string
  description: string
  inputSchema: TInput
  outputSchema: TOutput
  annotations: ToolAnnotations
  handler: (
    args: ToolInput<TInput>,
    session: McpSession
  ) => Promise<CallToolResult>
}): McpToolDefinition {
  /**
   * The scope check lives here rather than in the registry, so it runs on every
   * call no matter how the tool was reached. Filtering `tools/list` is a
   * usability feature; this is the enforcement.
   */
  async function guarded(args: ToolInput<TInput>, session: McpSession) {
    if (definition.scope && !sessionHasScope(session, definition.scope)) {
      return scopeRequiredError(definition.scope)
    }

    try {
      return await definition.handler(args, session)
    } catch (error) {
      return toolErrorFromException(error, definition.name)
    }
  }

  return {
    name: definition.name,
    scope: definition.scope,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    annotations: definition.annotations,
    register: (server, session) => {
      // The schemas are widened to the raw-shape type on the way in. Keeping
      // `TInput` out of the SDK call avoids a callback signature that resolves
      // to an unresolvable conditional type; the argument shape is still
      // checked at every definition site, through `handler`.
      const config: {
        title: string
        description: string
        inputSchema: z.ZodRawShape
        outputSchema: z.ZodRawShape
        annotations: ToolAnnotations
      } = {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        outputSchema: definition.outputSchema,
        annotations: definition.annotations,
      }

      return server.registerTool(definition.name, config, (args) =>
        guarded(args as ToolInput<TInput>, session)
      )
    },
    invoke: async (args, session) => {
      // Scope before input: on the real transport an out-of-scope tool is
      // disabled, so the SDK rejects the call before it validates anything.
      if (definition.scope && !sessionHasScope(session, definition.scope)) {
        return scopeRequiredError(definition.scope)
      }

      const parsed = z.object(definition.inputSchema).safeParse(args ?? {})

      if (!parsed.success) {
        return toolError({
          code: "VALIDATION_ERROR",
          message: parsed.error.issues
            .map(
              (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`
            )
            .join("; "),
        })
      }

      return guarded(parsed.data as ToolInput<TInput>, session)
    },
  }
}

/** Annotations shared by every level 1 tool: reads nothing but our own data. */
export const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

/** Adds data without changing or removing anything that exists. */
export const CREATE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
}

/**
 * Overwrites stored values, so it is flagged destructive and clients can ask
 * for confirmation. Every update tool sets an explicit end state, so repeating
 * a call yields the same result (plan 9.2).
 */
export const UPDATE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
}

export type WriteToolResult = {
  structuredContent: Record<string, unknown>
  summary: string
  /** The resource the call created or changed, for the audit trail. */
  resourceId: string | null
  /** A preview that was rolled back. Audited as `dry_run`, not `success`. */
  dryRun?: boolean
}

/**
 * A tool that mutates household data. On top of `defineTool` it records an
 * audit event for every attempt that passed the scope check, successful or
 * not. Handlers report expected failures by throwing an `ApplicationError`, so
 * the audit outcome and the client-facing error come from the same place.
 */
export function defineWriteTool<
  TInput extends z.ZodRawShape,
  TOutput extends z.ZodRawShape,
>(definition: {
  name: string
  scope: McpScope
  title: string
  description: string
  inputSchema: TInput
  outputSchema: TOutput
  annotations: ToolAnnotations
  /** Audit resource type, e.g. `shopping_item`. */
  resourceType: string
  handler: (
    args: ToolInput<TInput>,
    session: McpSession
  ) => Promise<WriteToolResult>
}): McpToolDefinition {
  const { handler, resourceType, ...rest } = definition

  return defineTool({
    ...rest,
    handler: async (args, session) => {
      const startedAt = Date.now()
      const audit = (outcome: McpAuditOutcome, resourceId: string | null) =>
        recordMcpAuditEvent({
          userId: session.context.userId,
          householdId: session.context.householdId,
          clientId: session.clientId,
          toolName: definition.name,
          resourceType,
          resourceId,
          outcome,
          correlationId: session.correlationId ?? null,
          durationMs: Date.now() - startedAt,
        })

      try {
        const result = await handler(args, session)
        await audit(result.dryRun ? "dry_run" : "success", result.resourceId)
        return toolSuccess(result.structuredContent, result.summary)
      } catch (error) {
        await audit(
          isApplicationError(error)
            ? (error.code.toLowerCase() as McpAuditOutcome)
            : "internal_error",
          null
        )
        throw error
      }
    },
  })
}
