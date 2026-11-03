import { describe, expect, it } from "vitest"

import {
  isClientIdMetadataUrl,
  isPrivateIpAddress,
  validateClientMetadata,
} from "./client-metadata"

const validDocument = {
  client_id: "https://client.example/metadata.json",
  client_name: "Example MCP Client",
  redirect_uris: ["http://127.0.0.1:8080/callback"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
}

describe("validateClientMetadata", () => {
  it("accepts a well-formed document", () => {
    const result = validateClientMetadata(validDocument)

    expect(result.ok).toBe(true)
    expect(result.ok && result.metadata).toEqual({
      clientName: "Example MCP Client",
      redirectUris: ["http://127.0.0.1:8080/callback"],
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
    })
  })

  it("defaults grant and response types", () => {
    const result = validateClientMetadata({
      client_name: "Minimal",
      redirect_uris: ["https://client.example/cb"],
    })

    expect(result.ok && result.metadata.grantTypes).toEqual([
      "authorization_code",
      "refresh_token",
    ])
    expect(result.ok && result.metadata.responseTypes).toEqual(["code"])
  })

  it("rejects a client that wants to authenticate with a secret", () => {
    const result = validateClientMetadata({
      ...validDocument,
      token_endpoint_auth_method: "client_secret_basic",
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.rejection.field).toBe(
      "token_endpoint_auth_method"
    )
  })

  it("rejects implicit flow and client credentials", () => {
    expect(
      validateClientMetadata({ ...validDocument, response_types: ["token"] }).ok
    ).toBe(false)
    expect(
      validateClientMetadata({
        ...validDocument,
        grant_types: ["client_credentials"],
      }).ok
    ).toBe(false)
  })

  it("rejects redirect URIs that break the scheme rules", () => {
    const result = validateClientMetadata({
      ...validDocument,
      redirect_uris: ["http://localhost:8080/callback"],
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.rejection.field).toBe("redirect_uris")
  })

  it("enforces list and length limits", () => {
    expect(
      validateClientMetadata({
        ...validDocument,
        client_name: "x".repeat(201),
      }).ok
    ).toBe(false)
    expect(
      validateClientMetadata({
        ...validDocument,
        redirect_uris: Array.from(
          { length: 6 },
          (_, index) => `https://client.example/cb${index}`
        ),
      }).ok
    ).toBe(false)
    expect(
      validateClientMetadata({ ...validDocument, redirect_uris: [] }).ok
    ).toBe(false)
  })
})

describe("isClientIdMetadataUrl", () => {
  it("requires https and a path component", () => {
    expect(isClientIdMetadataUrl("https://client.example/metadata.json")).toBe(
      true
    )
    expect(isClientIdMetadataUrl("https://client.example")).toBe(false)
    expect(isClientIdMetadataUrl("https://client.example/")).toBe(false)
    expect(isClientIdMetadataUrl("http://client.example/metadata.json")).toBe(
      false
    )
    expect(isClientIdMetadataUrl("mcp-dcr-abc123")).toBe(false)
  })
})

describe("isPrivateIpAddress", () => {
  it("blocks the ranges an SSRF would target", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      // The form `new URL()` and DNS actually produce for mapped addresses.
      "::ffff:7f00:1",
      "::ffff:a00:1",
      "::ffff:c0a8:101",
      "[::ffff:7f00:1]",
      "0:0:0:0:0:ffff:7f00:1",
      "::7f00:1",
      "64:ff9b::a00:1",
      "64:ff9b:1::1",
      "2002:7f00:1::1",
      "2001:0:4136:e378::1",
      "2001:db8::1",
      "fe80::1%eth0",
      "febf::1",
      "fc00::1",
      "not:an:address::x",
    ]) {
      expect(isPrivateIpAddress(address), address).toBe(true)
    }
  })

  it("allows public addresses", () => {
    for (const address of [
      "1.1.1.1",
      "203.0.114.1",
      "8.8.8.8",
      "2606:4700::1",
      "::ffff:808:808",
      "64:ff9b::808:808",
      "2002:808:808::1",
      "2a01:4f9:c010::1",
    ]) {
      expect(isPrivateIpAddress(address), address).toBe(false)
    }
  })

  it("treats a non-address string as unsafe", () => {
    expect(isPrivateIpAddress("internal-host")).toBe(true)
  })
})
