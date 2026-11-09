import { describe, expect, it, vi } from "vitest"

vi.mock("@workspace/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/db")>()),
  // No write test here may reach the database: every call below must be
  // stopped by the scope guard first.
  db: new Proxy(
    {},
    {
      get: () => {
        throw new Error("write tool reached the database")
      },
    }
  ),
}))

import type { McpSession } from "../auth/session"
import { MCP_SCOPES, type McpScope } from "../oauth/scopes"
import { createToolRegistry } from "./index"

const registry = createToolRegistry()
const writeTools = registry.filter(
  (tool) => tool.annotations.readOnlyHint !== true
)
const readTools = registry.filter(
  (tool) => tool.annotations.readOnlyHint === true
)

function session(scopes: McpScope[]): McpSession {
  return {
    context: { userId: "user-1", householdId: "household-1", role: "MEMBER" },
    scopes,
    clientId: "client-1",
    tokenId: "token-1",
  }
}

const READ_SCOPES = MCP_SCOPES.filter((scope) => scope.endsWith(":read"))

describe("write tool contracts", () => {
  it("has write tools for every domain", () => {
    const domains = new Set(writeTools.map((tool) => tool.scope?.split(":")[0]))
    expect([...domains].sort()).toEqual([
      "budget",
      "garden",
      "maintenance",
      "shopping",
    ])
  })

  it("registers exactly the documented write surface", () => {
    expect(writeTools.map((tool) => tool.name).sort()).toEqual(
      [
        "create-shopping-list",
        "update-shopping-list",
        "add-shopping-items",
        "update-shopping-item",
        "set-shopping-item-status",
        "add-product-alternative",
        "update-product-alternative",
        "set-preferred-alternative",
        "reorder-product-alternatives",
        "delete-product-alternative",
        "move-shopping-items",
        "delete-shopping-items",
        "create-shopping-category",
        "create-budget-entry",
        "add-budget-entries",
        "update-budget-entry",
        "delete-budget-entry",
        "create-budget-category",
        "update-budget-category",
        "delete-budget-category",
        "create-budget-member",
        "update-budget-member",
        "delete-budget-member",
        "create-budget-loan",
        "update-budget-loan",
        "delete-budget-loan",
        "create-budget-trip",
        "update-budget-trip",
        "delete-budget-trip",
        "update-budget-settings",
        "create-project",
        "update-project",
        "delete-project",
        "add-project-step",
        "update-project-step",
        "reorder-project-steps",
        "delete-project-step",
        "add-project-vendor",
        "update-project-vendor",
        "set-selected-project-vendor",
        "delete-project-vendor",
        "create-plant",
        "update-plant",
        "delete-plant",
        "create-garden-bed",
        "update-garden-bed",
        "delete-garden-bed",
      ].sort()
    )
  })

  it.each(
    writeTools
      .filter((tool) => tool.name.startsWith("update-"))
      .map((tool) => [tool.name, tool] as const)
  )("%s offers optimistic concurrency", (_name, tool) => {
    expect(tool.inputSchema).toHaveProperty("expectedUpdatedAt")
  })

  it.each(writeTools.map((tool) => [tool.name, tool] as const))(
    "%s requires a *:write scope and is annotated as a closed-world mutation",
    (_name, tool) => {
      expect(tool.scope).toMatch(/:write$/)
      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        openWorldHint: false,
      })
      expect(typeof tool.annotations.destructiveHint).toBe("boolean")
      expect(typeof tool.annotations.idempotentHint).toBe("boolean")
      expect(Object.keys(tool.outputSchema).length).toBeGreaterThan(0)
    }
  )

  it.each(readTools.map((tool) => [tool.name, tool] as const))(
    "%s never asks for a write scope",
    (_name, tool) => {
      expect(tool.scope === null || tool.scope.endsWith(":read")).toBe(true)
    }
  )

  it.each(writeTools.map((tool) => [tool.name, tool] as const))(
    "%s refuses a token that has every read scope but no write scope",
    async (_name, tool) => {
      const result = await tool.invoke({}, session([...READ_SCOPES]))

      expect(result.isError).toBe(true)
      expect(result.structuredContent).toMatchObject({
        error: { code: "SCOPE_REQUIRED" },
      })
    }
  )

  it.each(writeTools.map((tool) => [tool.name, tool] as const))(
    "%s refuses a write token for a different domain",
    async (_name, tool) => {
      const domain = tool.scope?.split(":")[0]
      const otherWriteScopes = MCP_SCOPES.filter(
        (scope) => scope.endsWith(":write") && !scope.startsWith(`${domain}:`)
      )

      const result = await tool.invoke({}, session(otherWriteScopes))

      expect(result.structuredContent).toMatchObject({
        error: { code: "SCOPE_REQUIRED" },
      })
    }
  )

  it("exposes no full-replace, sharing or administrative tool", () => {
    for (const tool of registry) {
      expect(tool.name).not.toMatch(
        /replace|share|member-role|admin|household|privacy/
      )
    }
  })

  // Deleting is allowed for shopping items and alternatives (ADR 0005), for
  // projects with their steps and vendors (ADR 0006) and for budget rows
  // (ADR 0007), and for plants and garden beds (ADR 0008). A new delete tool is a decision, not a side effect of adding a
  // feature.
  it("allows deletion only where it was decided", () => {
    const deleting = registry
      .filter((tool) => /delete|remove/.test(tool.name))
      .map((tool) => tool.name)
      .sort()

    expect(deleting).toEqual([
      "delete-budget-category",
      "delete-budget-entry",
      "delete-budget-loan",
      "delete-budget-member",
      "delete-budget-trip",
      "delete-garden-bed",
      "delete-plant",
      "delete-product-alternative",
      "delete-project",
      "delete-project-step",
      "delete-project-vendor",
      "delete-shopping-items",
    ])
  })

  it.each(
    writeTools
      .filter((tool) => tool.name.startsWith("delete-"))
      .map((tool) => [tool.name, tool] as const)
  )("%s is annotated as destructive and not idempotent", (_name, tool) => {
    expect(tool.annotations).toMatchObject({
      destructiveHint: true,
      idempotentHint: false,
    })
  })

  it("uses verb-noun kebab-case names", () => {
    for (const tool of registry) {
      expect(tool.name).toMatch(/^[a-z]+(-[a-z]+)+$/)
    }
  })
})
