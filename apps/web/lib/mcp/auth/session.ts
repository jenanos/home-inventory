import {
  getApplicationContext,
  type ApplicationContext,
} from "../../application/context"
import { expandEffectiveScopes, type McpScope } from "../oauth/scopes"

/**
 * Everything a tool is allowed to know about the caller. The household is
 * always derived here from the token subject, never from tool input, and the
 * membership is re-read on every request so removing a user takes effect while
 * their access token is still technically valid.
 */
export type McpSession = {
  context: ApplicationContext
  /** Effective scopes: `*:write` already expanded to include `*:read`. */
  scopes: McpScope[]
  clientId: string
  tokenId: string
  /** Request correlation id, set by the route. Links audit rows to log lines. */
  correlationId?: string
}

export async function createMcpSession(input: {
  userId: string
  clientId: string
  tokenId: string
  scopes: readonly McpScope[]
  loadContext?: (userId: string) => Promise<ApplicationContext>
}): Promise<McpSession> {
  const loadContext = input.loadContext ?? getApplicationContext
  const context = await loadContext(input.userId)

  return {
    context,
    scopes: expandEffectiveScopes(input.scopes),
    clientId: input.clientId,
    tokenId: input.tokenId,
  }
}

export function sessionHasScope(session: McpSession, scope: McpScope) {
  return session.scopes.includes(scope)
}
