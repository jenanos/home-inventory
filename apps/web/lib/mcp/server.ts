import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import type { McpSession } from "./auth/session"
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./constants"
import { createToolRegistry, type McpToolDefinition } from "./tools"

/**
 * Sent once at initialization. Most clients put it in the model's context, so
 * it carries the conventions the old copy-paste LLM import prompt used to
 * explain. Keep it short: it is paid for on every conversation.
 */
export const MCP_SERVER_INSTRUCTIONS = `Home Overview manages one household's home: shopping lists for things to buy for the house, budget, home projects and garden plants. Text in the app is Norwegian; write names and descriptions in Norwegian unless the user asks otherwise.

Shopping:
- A shopping item is a purchase need ("Vaskemaskin", "Hageslange"), not a product. Put concrete products, models and offers for the same need under the item's alternatives, best first; the first alternative's price is the item's effective price.
- Before adding, check what exists with search-shopping-items or get-shopping-list. add-shopping-items skips names already on the list.
- priority is how important it is (HIGH must have, MEDIUM should have, LOW nice to have); timeframe is when it is needed (NOW, SOON, LATER, SOMEDAY); dueDate is only for a real deadline.
- Prices are NOK numbers without currency signs. url and imageUrl are plain absolute https URLs, not markdown links.
- Mark bought items with set-shopping-item-status. Use SKIPPED for things no longer wanted; delete only mistakes and duplicates, and confirm with the user first.
- Use list-shopping-categories for category ids; create a category only when none fits.

Projects:
- A project is anything the household wants done to the home: maintenance, repairs, renovations, improvements or other. Set type accordingly; many projects are done by the household itself.
- execution says who does the work: SELF, VENDOR or MIXED (null if not decided). Add vendor quotes only when someone is hired.
- Lay out a project in one call with create-project and its steps; mark progress with update-project-step completed true, and set status IN_PROGRESS or COMPLETED on the project.
- To buy materials or equipment for a project, create a shopping list with create-shopping-list and projectId (or link an existing one with update-shopping-list), then add items to it. get-project shows its lists with totals.
- Prefer COMPLETED or ON_HOLD over deleting; delete only mistakes and duplicates, and confirm with the user first.

Budget:
- Amounts are NOK numbers. An entry has amount and frequency (WEEKLY, MONTHLY, QUARTERLY, SEMIANNUAL, YEARLY): enter a yearly bill as it is billed, the app converts it to a monthly figure.
- Entry types: INCOME, EXPENSE, DEDUCTION, SAVINGS. Use SAVINGS for money set aside (funds, BSU, buffer), not EXPENSE.
- Loans hold today's remaining balance and remaining term; add one loan per bank or loan part. Interest, principal and the interest deduction are calculated.
- Read get-budget-details first. Lay out several entries with add-budget-entries (categoryName creates missing categories, existing names are skipped).
- Rows list missingFields: optional details that are empty, such as provider, paymentDay, renewalDate, a member's actual netMonthlyIncome or the budget's propertyValue. Fill them from what the user tells you or shows you, e.g. a payslip or an invoice; never guess.
- Use dryRun to show the effect before saving anything the user has not confirmed. Delete only what the user wants gone, and confirm first.

Garden:
- One plant record per kind of plant the user tracks, however many beds it grows in. Beds are separate records (list-garden-beds, create-garden-bed); a plant's placements list the beds it grows in, with an optional quantity. To add a plant to another bed or move it, update its placements with update-plant instead of creating a duplicate.
- Check list-plants before adding; add-plants takes many at once and skips names that exist, so update those instead.
- Enums: plantType TREE, SHRUB, PERENNIAL, ANNUAL, FLOWER, HERB, VEGETABLE, CLIMBER, GRASS, OTHER; lifecycle ANNUAL, BIENNIAL, PERENNIAL; wateringNeed LOW, MEDIUM, HIGH; wateringMethod MANUAL or AUTOMATIC (irrigation); sunNeed FULL_SUN, PARTIAL_SHADE, SHADE. Hardiness zones use the Norwegian H1–H8 scale.
- Plants list missingFields: empty care details such as species, sunNeed or careInstructions. Fill them from what the user tells you or a reliable source, and leave out what you are unsure of; never guess. isToxic means toxic to people or pets; put details in toxicityNotes.
- imageUrl and sourceUrl are plain absolute https URLs you have seen, not markdown links; the server never fetches them.
- Record watering and pruning with record-plant-care; list-plants with notWateredSince finds plants that need water.
- Delete only mistakes, duplicates and plants that are gone, and confirm with the user first.

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
