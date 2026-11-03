import { describe, expect, it } from "vitest"

import type { McpConfig } from "../config"
import { issueAccessToken } from "../oauth/access-token"
import {
  authenticateMcpRequest,
  buildAuthenticateHeader,
  extractBearerToken,
  insufficientScopeResponse,
  invalidTokenResponse,
} from "./bearer"

const config = {
  enabled: true,
  issuer: "https://home.jenanos.xyz",
  resource: "https://home.jenanos.xyz/api/mcp",
  signingSecret: "s".repeat(32),
  accessTokenTtlSeconds: 1800,
  refreshTokenTtlSeconds: 2592000,
  clockSkewSeconds: 30,
  writeDomains: [],
} satisfies Extract<McpConfig, { enabled: true }>

function request(authorization?: string) {
  return new Request("https://home.jenanos.xyz/api/mcp", {
    headers: authorization ? { Authorization: authorization } : {},
  })
}

describe("extractBearerToken", () => {
  it("accepts the scheme case-insensitively", () => {
    expect(extractBearerToken(request("bearer abc"))).toBe("abc")
    expect(extractBearerToken(request("Bearer abc"))).toBe("abc")
  })

  it.each([
    ["no header", undefined],
    ["another scheme", "Basic abc"],
    ["no credentials", "Bearer"],
    ["extra parameters", "Bearer abc def"],
  ])("rejects %s", (_case, header) => {
    expect(extractBearerToken(request(header))).toBeNull()
  })
})

describe("authenticateMcpRequest", () => {
  const validToken = issueAccessToken({
    issuer: config.issuer,
    resource: config.resource,
    signingSecret: config.signingSecret,
    userId: "user-1",
    clientId: "client-1",
    scopes: ["budget:write"],
    expiresInSeconds: 900,
  }).token

  it("returns the claims and the granted scopes", () => {
    const result = authenticateMcpRequest(
      request(`Bearer ${validToken}`),
      config
    )

    expect(result).toMatchObject({
      ok: true,
      token: {
        claims: { sub: "user-1", client_id: "client-1" },
        // Raw scopes; expansion to effective scopes happens in the session.
        scopes: ["budget:write"],
      },
    })
  })

  it("rejects a token minted for a different resource", () => {
    const otherResource = issueAccessToken({
      issuer: config.issuer,
      resource: "https://home.jenanos.xyz/api/other",
      signingSecret: config.signingSecret,
      userId: "user-1",
      clientId: "client-1",
      scopes: ["budget:read"],
      expiresInSeconds: 900,
    }).token

    expect(
      authenticateMcpRequest(request(`Bearer ${otherResource}`), config)
    ).toEqual({ ok: false, reason: "audience-mismatch" })
  })

  it("reports a missing token separately from an invalid one", () => {
    expect(authenticateMcpRequest(request(), config)).toEqual({
      ok: false,
      reason: "missing-token",
    })
  })
})

describe("challenge responses", () => {
  it("points an unauthenticated client at the protected resource metadata", async () => {
    const response = invalidTokenResponse(config)
    const challenge = response.headers.get("www-authenticate") ?? ""

    expect(response.status).toBe(401)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(challenge).toContain(
      'resource_metadata="https://home.jenanos.xyz/.well-known/oauth-protected-resource/api/mcp"'
    )
  })

  it("names the missing scope on a 403 without describing the data", async () => {
    const response = insufficientScopeResponse(config, "budget:read")

    expect(response.status).toBe(403)
    expect(response.headers.get("www-authenticate")).toContain(
      'scope="budget:read"'
    )
    await expect(response.json()).resolves.toEqual({
      error: "insufficient_scope",
      error_description: "Tokenet mangler nødvendig scope: budget:read.",
    })
  })

  it("advertises the metadata even without a specific challenge", () => {
    expect(buildAuthenticateHeader(config)).toBe(
      'Bearer realm="home-overview-mcp", resource_metadata="https://home.jenanos.xyz/.well-known/oauth-protected-resource/api/mcp"'
    )
  })
})
