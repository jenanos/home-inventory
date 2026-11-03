"use server"

import { revalidatePath } from "next/cache"

import { requireAuth } from "@/lib/session"
import { mcpConfig } from "@/lib/mcp/config"
import { createOAuthTokenRepository } from "@/lib/mcp/oauth/repository"

/**
 * Revokes a connected client. The grant is looked up by user *and* id in one
 * query, so a guessed grant id belonging to someone else matches nothing.
 *
 * Refresh stops immediately. An access token that is already out keeps working
 * until it expires, which is at most `accessTokenTtlSeconds`.
 */
export async function revokeConnectedApp(grantId: string) {
  const session = await requireAuth()

  if (!mcpConfig.enabled) {
    throw new Error("MCP er ikke konfigurert på denne serveren.")
  }

  const result = await createOAuthTokenRepository(mcpConfig).revokeUserGrant(
    session.user.id,
    grantId
  )

  if (!result.grantRevoked) {
    throw new Error("Tilkoblingen finnes ikke.")
  }

  revalidatePath("/settings")

  return { refreshTokensRevoked: result.refreshTokensRevoked }
}
