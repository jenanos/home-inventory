import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import type { McpSession } from "./auth/session"
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./constants"
import { createToolRegistry, type McpToolDefinition } from "./tools"

/**
 * Sent once at initialization. Most clients put it in the model's context, so
 * it carries the conventions the old copy-paste LLM import prompt used to
 * explain. Keep it short: it is paid for on every conversation.
 */
export const MCP_SERVER_INSTRUCTIONS = `Home Overview manages one household's home: shopping lists for things to buy for the house, budget, maintenance tasks and garden plants. Text in the app is Norwegian; write names and descriptions in Norwegian unless the user asks otherwise.

Shopping:
- A shopping item is a purchase need ("Vaskemaskin", "Hageslange"), not a product. Put concrete products, models and offers for the same need under the item's alternatives, best first; the first alternative's price is the item's effective price.
- Before adding, check what exists with search-shopping-items or get-shopping-list. add-shopping-items skips names already on the list.
- priority is how important it is (HIGH must have, MEDIUM should have, LOW nice to have); timeframe is when it is needed (NOW, SOON, LATER, SOMEDAY); dueDate is only for a real deadline.
- Prices are NOK numbers without currency signs. url and imageUrl are plain absolute https URLs, not markdown links.
- Mark bought items with set-shopping-item-status. Use SKIPPED for things no longer wanted; delete only mistakes and duplicates, and confirm with the user first.
- Use list-shopping-categories for category ids; create a category only when none fits.

Every update tool accepts expectedUpdatedAt from your last read; a CONFLICT error means someone changed the data, so read again before retrying. get-server-info shows which domains this token may change.`

type McpServerDependencies = {
  session: McpSession
  now?: () => Date
  tools?: McpToolDefinition[]
}

/**
 * Builds a server for exactly one request. The transport is stateless, so a
 * fresh instance per request is not overhead we are avoiding — it is what lets
 * the tool list be shaped by this token's scopes.
 *
 * Out-of-scope tools are registered and then disabled rather than skipped: the
 * scope guard inside each tool still runs on `tools/call`, so filtering the
 * list is presentation, not the security boundary.
 */
export function createMcpServer({
  session,
  now = () => new Date(),
  tools = createToolRegistry(now),
}: McpServerDependencies) {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { instructions: MCP_SERVER_INSTRUCTIONS }
  )

  for (const tool of tools) {
    const registered = tool.register(server, session)

    if (tool.scope !== null && !session.scopes.includes(tool.scope)) {
      registered.disable()
    }
  }

  return server
}
