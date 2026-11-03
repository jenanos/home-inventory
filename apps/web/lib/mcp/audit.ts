import { db } from "@workspace/db"

import type { ApplicationErrorCode } from "../application/errors"

/**
 * Audit trail for MCP mutations (plan chapter 12). A row says who, through
 * which client, ran which tool against which resource and how it went. It never
 * holds tool input, before/after copies or free text, so the trail cannot
 * become a second copy of budget data.
 */

/** How long audit rows are kept before the periodic cleanup removes them. */
export const MCP_AUDIT_RETENTION_DAYS = 180

export type McpAuditOutcome =
  | "success"
  /** A budget preview: the change ran and was rolled back. */
  | "dry_run"
  | Lowercase<ApplicationErrorCode>

export type McpAuditEventInput = {
  userId: string
  householdId: string
  clientId: string
  toolName: string
  resourceType: string
  resourceId: string | null
  outcome: McpAuditOutcome
  correlationId: string | null
  durationMs: number
}

export type McpAuditRecorder = (event: McpAuditEventInput) => Promise<void>

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const databaseRecorder: McpAuditRecorder = async (event) => {
  await db.mcpAuditEvent.create({
    data: {
      ...event,
      // Both columns are UUIDs; anything else is dropped rather than letting
      // a malformed value fail the insert.
      resourceId:
        event.resourceId && UUID_PATTERN.test(event.resourceId)
          ? event.resourceId
          : null,
      correlationId:
        event.correlationId && UUID_PATTERN.test(event.correlationId)
          ? event.correlationId
          : null,
    },
  })
}

let recorder: McpAuditRecorder = databaseRecorder

/**
 * Never throws. The mutation has already committed when this runs, so failing
 * the tool call would tell the client its change did not happen when it did.
 * A lost audit row is logged loudly instead.
 */
export async function recordMcpAuditEvent(event: McpAuditEventInput) {
  try {
    await recorder(event)
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "mcp.audit_failed",
        toolName: event.toolName,
        correlationId: event.correlationId,
      }),
      error
    )
  }
}

/** Test seam. Passing no recorder restores the database default. */
export function setMcpAuditRecorder(next: McpAuditRecorder | null) {
  recorder = next ?? databaseRecorder
}

export async function deleteExpiredAuditEvents(now = new Date()) {
  const cutoff = new Date(
    now.getTime() - MCP_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  )
  const result = await db.mcpAuditEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  })
  return result.count
}
