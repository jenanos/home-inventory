import { deleteExpiredUploadLinks } from "../application/attachments/upload-links"
import { deleteExpiredAuditEvents } from "./audit"
import { mcpConfig, type McpConfig } from "./config"
import { createOAuthTokenRepository } from "./oauth/repository"

/**
 * Periodic housekeeping for MCP state (plan 13.2). It is needed only for disk
 * use, never for correctness: every expiry is also enforced when a row is read.
 *
 * Runs in-process because the deployment has exactly one replica. Two replicas
 * would both run it; the deletes are idempotent, so that is wasteful but safe.
 */

export const MCP_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000
const STARTUP_DELAY_MS = 60 * 1000

export type McpCleanupResult = {
  oauth: Awaited<
    ReturnType<
      ReturnType<typeof createOAuthTokenRepository>["cleanupExpiredRows"]
    >
  > | null
  auditEvents: number
  uploadLinks: number
}

export async function runMcpCleanup(
  config: McpConfig = mcpConfig,
  now = new Date()
): Promise<McpCleanupResult> {
  let oauth: McpCleanupResult["oauth"] = null

  if (config.enabled) {
    // Consumed and revoked refresh tokens are kept for a full refresh-token
    // lifetime: reuse detection needs the consumed row to recognise a replayed
    // token and revoke its family. After that the token is expired anyway.
    const finalizedBefore = new Date(
      now.getTime() - config.refreshTokenTtlSeconds * 1000
    )
    oauth = await createOAuthTokenRepository(config).cleanupExpiredRows(
      finalizedBefore,
      now
    )
  }

  const auditEvents = await deleteExpiredAuditEvents(now)
  const uploadLinks = await deleteExpiredUploadLinks(now)
  return { oauth, auditEvents, uploadLinks }
}

const scheduleKey = Symbol.for("home-overview.mcp-cleanup")
type ScheduleHost = typeof globalThis & { [scheduleKey]?: boolean }

/** Starts the schedule once per process; later calls are no-ops. */
export function startMcpCleanupSchedule() {
  const host = globalThis as ScheduleHost
  if (host[scheduleKey]) return
  host[scheduleKey] = true

  const run = async () => {
    try {
      const result = await runMcpCleanup()
      console.info(JSON.stringify({ event: "mcp.cleanup", ...result }))
    } catch (error) {
      console.error(JSON.stringify({ event: "mcp.cleanup_failed" }), error)
    }
  }

  // Delayed so a container start is not competing with migrations and the
  // first requests; unref'd so the timers never keep the process alive.
  setTimeout(run, STARTUP_DELAY_MS).unref()
  setInterval(run, MCP_CLEANUP_INTERVAL_MS).unref()
}
