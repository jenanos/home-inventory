import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import { issueAccessToken, verifyAccessToken } from "./access-token"

const ISSUER = "https://home.jenanos.xyz"
const RESOURCE = `${ISSUER}/api/mcp`
const SECRET = "unit-test-signing-secret".padEnd(32, "-")
const NOW = new Date("2026-08-03T12:00:00.000Z")

function issue(
  overrides: Partial<Parameters<typeof issueAccessToken>[0]> = {}
) {
  return issueAccessToken({
    issuer: ISSUER,
    resource: RESOURCE,
    signingSecret: SECRET,
    userId: "user-1",
    clientId: "https://client.example/metadata.json",
    scopes: ["shopping:read", "budget:write"],
    expiresInSeconds: 1800,
    now: NOW,
    ...overrides,
  })
}

function verify(token: string, overrides: Record<string, unknown> = {}) {
  return verifyAccessToken({
    token,
    issuer: ISSUER,
    resource: RESOURCE,
    signingSecret: SECRET,
    clockSkewSeconds: 30,
    now: NOW,
    ...overrides,
  })
}

describe("issueAccessToken", () => {
  it("sets the required claims", () => {
    const { claims } = issue()

    expect(claims).toMatchObject({
      iss: ISSUER,
      sub: "user-1",
      aud: RESOURCE,
      scope: "shopping:read budget:write",
      client_id: "https://client.example/metadata.json",
      iat: NOW.getTime() / 1000,
      exp: NOW.getTime() / 1000 + 1800,
    })
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe("verifyAccessToken", () => {
  it("accepts a freshly issued token", () => {
    const { token } = issue()
    const result = verify(token)

    expect(result.ok).toBe(true)
    expect(result.ok && result.scopes).toEqual([
      "shopping:read",
      "budget:write",
    ])
  })

  it("rejects a token signed with another secret", () => {
    const { token } = issue({ signingSecret: "another-secret".padEnd(32, "-") })
    expect(verify(token)).toEqual({ ok: false, reason: "invalid-signature" })
  })

  it("rejects a token from another issuer", () => {
    const { token } = issue({ issuer: "https://evil.example" })
    expect(verify(token)).toEqual({ ok: false, reason: "issuer-mismatch" })
  })

  it("rejects a token minted for another resource", () => {
    const { token } = issue({ resource: "https://other.example/api/mcp" })
    expect(verify(token)).toEqual({ ok: false, reason: "audience-mismatch" })
  })

  it("rejects an expired token once the skew allowance is gone", () => {
    const { token } = issue({ expiresInSeconds: 60 })

    expect(verify(token, { now: new Date(NOW.getTime() + 80_000) }).ok).toBe(
      true
    )
    expect(verify(token, { now: new Date(NOW.getTime() + 91_000) })).toEqual({
      ok: false,
      reason: "expired",
    })
  })

  it("never takes the algorithm from the token header", () => {
    const { token } = issue()
    const [, payload, signature] = token.split(".")
    const noneHeader = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
      "utf8"
    ).toString("base64url")

    expect(verify(`${noneHeader}.${payload}.`)).toEqual({
      ok: false,
      reason: "unsupported-algorithm",
    })
    expect(verify(`${noneHeader}.${payload}.${signature}`)).toEqual({
      ok: false,
      reason: "unsupported-algorithm",
    })
  })

  it("rejects a structurally broken token", () => {
    expect(verify("not-a-token")).toEqual({ ok: false, reason: "malformed" })
  })

  it("rejects a token carrying an unknown scope", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
      "utf8"
    ).toString("base64url")
    const payload = Buffer.from(
      JSON.stringify({
        iss: ISSUER,
        sub: "user-1",
        aud: RESOURCE,
        scope: "admin:all",
        client_id: "c",
        jti: "j",
        iat: NOW.getTime() / 1000,
        exp: NOW.getTime() / 1000 + 60,
      }),
      "utf8"
    ).toString("base64url")
    const signature = createHmac("sha256", SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url")

    expect(verify(`${header}.${payload}.${signature}`)).toEqual({
      ok: false,
      reason: "invalid-claims",
    })
  })
})
