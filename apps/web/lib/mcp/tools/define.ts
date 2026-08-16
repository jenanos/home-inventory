import type {
  McpServer,
  RegisteredTool,
} from "@modelcontextprotocol/sdk/server/mcp.js"
import type {
  CallToolResult,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

import { sessionHasScope, type McpSession } from "../auth/session"
import type { McpScope } from "../oauth/scopes"
import {
  scopeRequiredError,
  toolError,
  toolErrorFromException,
} from "../result"

export type McpToolDefinition = {
  name: string
  /** Scope required to see and call the tool. `null` means any valid token. */
  scope: McpScope | null
  /** Exposed so contract tests can validate real responses against it. */
  outputSchema: z.ZodRawShape
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
    outputSchema: definition.outputSchema,
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
