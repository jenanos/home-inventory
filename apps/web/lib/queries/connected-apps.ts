import { db } from "@workspace/db"

import { mcpConfig } from "@/lib/mcp/config"
import { createOAuthTokenRepository } from "@/lib/mcp/oauth/repository"

export type ConnectedApp = {
  grantId: string
  clientName: string
  scopes: string[]
  connectedAt: Date
  lastUsedAt: Date | null
  /** The latest changes this client made on the user's behalf, newest first. */
  recentChanges: ConnectedAppChange[]
}

export type ConnectedAppChange = {
  id: string
  toolName: string
  outcome: string
  createdAt: Date
}

const RECENT_CHANGES_PER_APP = 5

/**
 * Deliberately a plain query rather than a Server Action: it takes a user id,
 * and an exported action would let any signed-in caller pass someone else's.
 */
export async function listConnectedApps(
  userId: string
): Promise<ConnectedApp[]> {
  if (!mcpConfig.enabled) {
    return []
  }

  const grants =
    await createOAuthTokenRepository(mcpConfig).listUserGrants(userId)

  // Scoped to the user as well as the client: a household member sees what
  // their own connection did, not another member's.
  const recentChanges = await Promise.all(
    grants.map((grant) =>
      db.mcpAuditEvent.findMany({
        where: { userId, clientId: grant.clientId },
        select: { id: true, toolName: true, outcome: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: RECENT_CHANGES_PER_APP,
      })
    )
  )

  return grants.map((grant, index) => ({
    grantId: grant.id,
    clientName: grant.client.name,
    scopes: grant.scopes,
    connectedAt: grant.createdAt,
    lastUsedAt: grant.lastUsedAt,
    recentChanges: recentChanges[index] ?? [],
  }))
}
