import { describe, expect, it } from "vitest"

import { createMcpUnavailableResponse, loadMcpConfig } from "./config"

const validEnvironment = {
  HOME_OVERVIEW_MCP_OAUTH_SIGNING_SECRET: "s".repeat(32),
  HOME_OVERVIEW_MCP_ISSUER: "https://home.jenanos.xyz",
}

describe("loadMcpConfig", () => {
  it("fails closed without required configuration", () => {
    expect(loadMcpConfig({})).toMatchObject({
      enabled: false,
      reason: "missing-or-invalid-configuration",
    })
  })

  it("derives the canonical resource and documented defaults", () => {
    expect(loadMcpConfig(validEnvironment)).toEqual({
      enabled: true,
      issuer: "https://home.jenanos.xyz",
      resource: "https://home.jenanos.xyz/api/mcp",
      signingSecret: "s".repeat(32),
      accessTokenTtlSeconds: 1800,
      refreshTokenTtlSeconds: 2592000,
      clockSkewSeconds: 30,
    })
  })

  it.each([
    "https://home.jenanos.xyz/",
    "https://home.jenanos.xyz/path",
    "http://home.jenanos.xyz",
    "http://localhost:3000",
  ])("rejects a non-canonical issuer: %s", (issuer) => {
    expect(
      loadMcpConfig({
        ...validEnvironment,
        HOME_OVERVIEW_MCP_ISSUER: issuer,
      })
    ).toMatchObject({ enabled: false })
  })

  it.each(["http://127.0.0.1:3000", "http://[::1]:3000"])(
    "allows an IP-literal loopback issuer for local development: %s",
    (issuer) => {
      expect(
        loadMcpConfig({
          ...validEnvironment,
          HOME_OVERVIEW_MCP_ISSUER: issuer,
        })
      ).toMatchObject({ enabled: true })
    }
  )
})

describe("createMcpUnavailableResponse", () => {
  it("returns a non-cacheable 503 response", async () => {
    const response = createMcpUnavailableResponse()

    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("retry-after")).toBe("60")
    await expect(response.json()).resolves.toMatchObject({
      error: "service_unavailable",
    })
  })
})
