import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { describe, expect, it, vi } from "vitest"

import type { McpSession } from "./auth/session"
import { expandEffectiveScopes, type McpScope } from "./oauth/scopes"
import { dealHuntPromptText, registerPrompts } from "./prompts"

function registeredPrompts(scopes: McpScope[]) {
  const registerPrompt = vi.fn()
  const session: McpSession = {
    context: { userId: "user-1", householdId: "household-1", role: "MEMBER" },
    scopes: expandEffectiveScopes(scopes),
    clientId: "client-1",
    tokenId: "token-1",
  }
  registerPrompts({ registerPrompt } as unknown as McpServer, session)
  return registerPrompt.mock.calls.map(([name]) => name)
}

describe("prompts", () => {
  it("offers the deal hunt only to a token that can report offers", () => {
    expect(registeredPrompts(["shopping:write"])).toEqual(["tilbudsjakt"])
    expect(registeredPrompts(["shopping:read", "garden:write"])).toEqual([])
  })

  it("names the tools the deal hunt needs and the stores to search", () => {
    const text = dealHuntPromptText("Jula, Biltema")

    for (const tool of [
      "list-deal-watch-items",
      "report-shopping-deals",
      "set-deal-watch",
    ]) {
      expect(text).toContain(tool)
    }
    expect(text).toContain("Jula, Biltema")
  })
})
