/**
 * Next.js calls `register` once when a server instance starts, never during
 * `next build`. Only the Node runtime has Prisma, so the Edge runtime skips it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { startMcpCleanupSchedule } = await import("./lib/mcp/cleanup")
  startMcpCleanupSchedule()
}
