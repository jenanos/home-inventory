import { describe, expect, it } from "vitest"

import { matchRedirectUri, validateRedirectUri } from "./redirect-uri"

describe("validateRedirectUri", () => {
  it("accepts HTTPS", () => {
    expect(validateRedirectUri("https://client.example/callback").ok).toBe(true)
  })

  it("accepts the RFC 8252 loopback IP literals over http", () => {
    expect(validateRedirectUri("http://127.0.0.1:1234/callback").ok).toBe(true)
    expect(validateRedirectUri("http://[::1]:1234/callback").ok).toBe(true)
  })

  it("rejects localhost, private addresses and other http hosts", () => {
    for (const value of [
      "http://localhost:1234/callback",
      "http://192.168.1.10/callback",
      "http://10.0.0.1/callback",
      "http://client.example/callback",
    ]) {
      const result = validateRedirectUri(value)
      expect(result.ok, value).toBe(false)
    }
  })

  it("rejects non-http schemes, fragments and credentials", () => {
    expect(validateRedirectUri("javascript:alert(1)").ok).toBe(false)
    expect(validateRedirectUri("myapp://callback").ok).toBe(false)
    expect(validateRedirectUri("https://client.example/cb#x").ok).toBe(false)
    expect(validateRedirectUri("https://user:pw@client.example/cb").ok).toBe(
      false
    )
  })

  it("rejects overlong values", () => {
    const value = `https://client.example/${"a".repeat(2048)}`
    expect(validateRedirectUri(value)).toEqual({
      ok: false,
      reason: "too-long",
    })
  })
})

describe("matchRedirectUri", () => {
  const https = ["https://client.example/callback"]
  const loopback = ["http://127.0.0.1:8080/callback"]

  it("matches HTTPS exactly", () => {
    expect(matchRedirectUri("https://client.example/callback", https)).toEqual({
      ok: true,
      redirectUri: "https://client.example/callback",
    })
  })

  it("rejects an HTTPS URI that differs in port, path or query", () => {
    expect(
      matchRedirectUri("https://client.example:8443/callback", https).ok
    ).toBe(false)
    expect(matchRedirectUri("https://client.example/callback2", https).ok).toBe(
      false
    )
    expect(
      matchRedirectUri("https://client.example/callback?next=x", https).ok
    ).toBe(false)
    expect(matchRedirectUri("https://evil.example/callback", https).ok).toBe(
      false
    )
  })

  it("allows any port for a registered loopback URI", () => {
    expect(
      matchRedirectUri("http://127.0.0.1:54321/callback", loopback)
    ).toEqual({ ok: true, redirectUri: "http://127.0.0.1:54321/callback" })
  })

  it("still requires the loopback path, query and host to match exactly", () => {
    expect(matchRedirectUri("http://127.0.0.1:54321/other", loopback).ok).toBe(
      false
    )
    expect(
      matchRedirectUri("http://127.0.0.1:54321/callback?x=1", loopback).ok
    ).toBe(false)
    expect(matchRedirectUri("http://[::1]:54321/callback", loopback).ok).toBe(
      false
    )
    expect(
      matchRedirectUri("http://localhost:8080/callback", loopback).ok
    ).toBe(false)
  })

  it("does not extend the port exception to https", () => {
    expect(
      matchRedirectUri("https://client.example:9999/callback", https).ok
    ).toBe(false)
  })
})
