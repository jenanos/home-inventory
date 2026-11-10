import { describe, expect, it } from "vitest"

import { isPublicPathname } from "./middleware"

describe("isPublicPathname", () => {
  it("allows public auth routes", () => {
    expect(isPublicPathname("/login")).toBe(true)
    expect(isPublicPathname("/login/verify")).toBe(true)
    expect(isPublicPathname("/shared/token-123")).toBe(true)
    expect(isPublicPathname("/api/auth/session")).toBe(true)
  })

  it("lets upload links through, but not the authenticated attachment API", () => {
    // The token in the path is the credential (ADR 0011).
    expect(isPublicPathname("/opplasting/abc")).toBe(true)
    expect(isPublicPathname("/api/upload-links/abc")).toBe(true)
    expect(isPublicPathname("/api/attachments")).toBe(false)
    expect(isPublicPathname("/api/attachments/abc")).toBe(false)
    expect(isPublicPathname("/opplastingfoo")).toBe(false)
  })

  it("allows PWA assets without a session", () => {
    expect(isPublicPathname("/manifest.webmanifest")).toBe(true)
    expect(isPublicPathname("/sw.js")).toBe(true)
    expect(isPublicPathname("/apple-icon-180.png")).toBe(true)
    expect(isPublicPathname("/icon-192.png")).toBe(true)
    expect(isPublicPathname("/icon-512.png")).toBe(true)
    expect(isPublicPathname("/icon.svg")).toBe(true)
  })

  it("allows only the exact MCP endpoint through middleware", () => {
    expect(isPublicPathname("/api/mcp")).toBe(true)
    expect(isPublicPathname("/api/mcp/anything")).toBe(false)
    expect(isPublicPathname("/api/mcp-malicious")).toBe(false)
  })

  it("lets OAuth and discovery reach their route handlers", () => {
    expect(isPublicPathname("/api/oauth/authorize")).toBe(true)
    expect(isPublicPathname("/api/oauth/authorize/decision")).toBe(true)
    expect(isPublicPathname("/api/oauth/token")).toBe(true)
    expect(isPublicPathname("/api/oauth/register")).toBe(true)
    expect(isPublicPathname("/api/oauth/revoke")).toBe(true)
    expect(isPublicPathname("/.well-known/oauth-authorization-server")).toBe(
      true
    )
    expect(isPublicPathname("/.well-known/oauth-protected-resource")).toBe(true)
    expect(
      isPublicPathname("/.well-known/oauth-protected-resource/api/mcp")
    ).toBe(true)
  })

  it("does not let a prefix collision through", () => {
    expect(isPublicPathname("/api/oauthfoo")).toBe(false)
    expect(isPublicPathname("/api/oauth")).toBe(false)
    expect(isPublicPathname("/.well-knownfoo")).toBe(false)
  })

  it("keeps the consent page behind login", () => {
    // The consent screen must know who is approving, so it stays protected.
    expect(isPublicPathname("/oauth/consent")).toBe(false)
  })

  it("keeps protected app routes private", () => {
    expect(isPublicPathname("/")).toBe(false)
    expect(isPublicPathname("/lists")).toBe(false)
    expect(isPublicPathname("/settings")).toBe(false)
  })
})
