import type { McpSession } from "../auth/session"
import { createAttachmentTools } from "./attachments"
import { budgetTools } from "./budget"
import { budgetWriteTools } from "./budget-write"
import { sessionHasToolScope, type McpToolDefinition } from "./define"
import { gardenTools } from "./garden"
import { gardenWriteTools } from "./garden-write"
import { projectTools } from "./projects"
import { projectWriteTools } from "./projects-write"
import { createServerInfoTool } from "./server-info"
import { shoppingTools } from "./shopping"
import { shoppingWriteTools } from "./shopping-write"

export type { McpToolDefinition } from "./define"

/**
 * The whole tool surface. Read tools go through the application read services;
 * write tools go through the write services the web flow also uses, and are
 * only visible with the matching `*:write` scope.
 *
 * There is no full-replace operation for any domain: an assistant clears data
 * with the individual delete tools, which tell it to confirm with the user
 * first (plan 10.4).
 */
export function createToolRegistry(
  now: () => Date = () => new Date()
): McpToolDefinition[] {
  return [
    createServerInfoTool(now),
    ...shoppingTools,
    ...shoppingWriteTools,
    ...budgetTools,
    ...budgetWriteTools,
    ...projectTools,
    ...projectWriteTools,
    ...gardenTools,
    ...gardenWriteTools,
    ...createAttachmentTools(),
  ]
}

export function toolsVisibleToSession(
  tools: readonly McpToolDefinition[],
  session: McpSession
) {
  return tools.filter((tool) => sessionHasToolScope(session, tool.scope))
}
