import { describe, expect, it } from "vitest"

import { oauthRedirectErrorResponse } from "./errors"

describe("oauthRedirectErrorResponse", () => {
  it("returns the error to the client with iss and state (RFC 9207)", () => {
    const response = oauthRedirectErrorResponse(
      "https://chatgpt.com/connector_platform_oauth_redirect",
      "access_denied",
      "Brukeren avviste forespørselen.",
      "https://home.jenanos.xyz",
      "state-123"
    )

    const location = new URL(response.headers.get("location") ?? "")
    expect(location.origin + location.pathname).toBe(
      "https://chatgpt.com/connector_platform_oauth_redirect"
    )
    expect(location.searchParams.get("error")).toBe("access_denied")
    expect(location.searchParams.get("iss")).toBe("https://home.jenanos.xyz")
    expect(location.searchParams.get("state")).toBe("state-123")
    expect(response.headers.get("cache-control")).toContain("no-store")
  })
})
