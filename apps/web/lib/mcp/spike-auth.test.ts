import { describe, expect, it } from "vitest"

import { isMcpSpikeAuthorized, loadMcpSpikeConfig } from "./spike-auth"

describe("loadMcpSpikeConfig", () => {
  it("cannot be enabled in production", () => {
    expect(
      loadMcpSpikeConfig({
        NODE_ENV: "production",
        HOME_OVERVIEW_MCP_SPIKE_TOKEN: "must-not-work",
      })
    ).toEqual({ enabled: false, reason: "production" })
  })

  it("requires an explicit token outside production", () => {
    expect(loadMcpSpikeConfig({ NODE_ENV: "development" })).toEqual({
      enabled: false,
      reason: "missing-token",
    })
  })
})

describe("isMcpSpikeAuthorized", () => {
  const config = { enabled: true as const, token: "local-secret" }

  it("accepts only the configured bearer token", () => {
    const validRequest = new Request("http://localhost/api/mcp", {
      headers: { Authorization: "Bearer local-secret" },
    })
    const invalidRequest = new Request("http://localhost/api/mcp", {
      headers: { Authorization: "Bearer another-secret" },
    })

    expect(isMcpSpikeAuthorized(validRequest, config)).toBe(true)
    expect(isMcpSpikeAuthorized(invalidRequest, config)).toBe(false)
  })
})
