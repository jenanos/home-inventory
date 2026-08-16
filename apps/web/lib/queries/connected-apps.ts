import { mcpConfig } from "@/lib/mcp/config"
import { createOAuthTokenRepository } from "@/lib/mcp/oauth/repository"

export type ConnectedApp = {
  grantId: string
  clientName: string
  scopes: string[]
  connectedAt: Date
  lastUsedAt: Date | null
}

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

  return grants.map((grant) => ({
    grantId: grant.id,
    clientName: grant.client.name,
    scopes: grant.scopes,
    connectedAt: grant.createdAt,
    lastUsedAt: grant.lastUsedAt,
  }))
}
