import type { McpSession } from "../auth/session"
import { budgetTools } from "./budget"
import type { McpToolDefinition } from "./define"
import { gardenTools } from "./garden"
import { maintenanceTools } from "./maintenance"
import { createServerInfoTool } from "./server-info"
import { shoppingTools } from "./shopping"

export type { McpToolDefinition } from "./define"

/**
 * The whole level 1 surface. Nothing here mutates: every tool is annotated
 * read-only and reaches the database through the application read services,
 * which is what keeps `replaceShoppingItems` and `replaceBudget` structurally
 * unreachable from MCP (chapter 10.4).
 */
export function createToolRegistry(
  now: () => Date = () => new Date()
): McpToolDefinition[] {
  return [
    createServerInfoTool(now),
    ...shoppingTools,
    ...budgetTools,
    ...maintenanceTools,
    ...gardenTools,
  ]
}

export function toolsVisibleToSession(
  tools: readonly McpToolDefinition[],
  session: McpSession
) {
  return tools.filter(
    (tool) => tool.scope === null || session.scopes.includes(tool.scope)
  )
}
