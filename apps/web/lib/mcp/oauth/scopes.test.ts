import { describe, expect, it } from "vitest"

import {
  domainsForScopes,
  enabledScopes,
  expandEffectiveScopes,
  formatScopeParameter,
  hasScope,
  MCP_SCOPES,
  MCP_SCOPE_DESCRIPTIONS,
  parseScopeParameter,
  restrictToEnabledScopes,
} from "./scopes"

describe("parseScopeParameter", () => {
  it("parses, de-duplicates and sorts known scopes", () => {
    expect(
      parseScopeParameter("budget:read shopping:read budget:read")
    ).toEqual({
      scopes: ["shopping:read", "budget:read"],
      unknown: [],
    })
  })

  it("reports unknown scopes instead of silently dropping them", () => {
    expect(parseScopeParameter("shopping:read admin:all")).toEqual({
      scopes: ["shopping:read"],
      unknown: ["admin:all"],
    })
  })

  it("treats a missing or empty parameter as no scopes", () => {
    expect(parseScopeParameter(null).scopes).toEqual([])
    expect(parseScopeParameter("   ").scopes).toEqual([])
  })
})

describe("expandEffectiveScopes", () => {
  it("lets a write scope read the same domain", () => {
    expect(expandEffectiveScopes(["budget:write"])).toEqual([
      "budget:read",
      "budget:write",
    ])
  })

  it("does not leak across domains", () => {
    expect(hasScope(["budget:write"], "shopping:read")).toBe(false)
    expect(hasScope(["shopping:write"], "shopping:read")).toBe(true)
    expect(hasScope(["shopping:read"], "shopping:write")).toBe(false)
  })
})

describe("domainsForScopes", () => {
  it("maps effective scopes to domains", () => {
    expect(domainsForScopes(["garden:write", "shopping:read"])).toEqual([
      "shopping",
      "garden",
    ])
  })
})

describe("consent metadata", () => {
  it("describes every scope in Norwegian, not just the scope name", () => {
    for (const scope of MCP_SCOPES) {
      const description = MCP_SCOPE_DESCRIPTIONS[scope]
      expect(description.title.length).toBeGreaterThan(0)
      expect(description.description.length).toBeGreaterThan(20)
      expect(description.description).not.toContain(scope)
    }
  })
})

describe("formatScopeParameter", () => {
  it("produces a stable space-separated value", () => {
    expect(formatScopeParameter(["budget:read", "shopping:read"])).toBe(
      "shopping:read budget:read"
    )
  })
})

describe("write domain switch", () => {
  it("offers every read scope and only the switched-on write scopes", () => {
    expect(enabledScopes(["garden"])).toEqual([
      "shopping:read",
      "budget:read",
      "maintenance:read",
      "garden:read",
      "garden:write",
    ])
  })

  it("drops write scopes of switched-off domains from a granted token", () => {
    expect(
      restrictToEnabledScopes(
        ["budget:read", "budget:write", "garden:write"],
        ["garden"]
      )
    ).toEqual(["budget:read", "garden:write"])
  })
})
