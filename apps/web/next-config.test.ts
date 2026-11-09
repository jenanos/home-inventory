import { describe, expect, it } from "vitest"

import nextConfig from "./next.config.mjs"

describe("next.config headers", () => {
  it("keeps a real Origin on the consent form POST", async () => {
    const rules = (await nextConfig.headers?.()) ?? []
    const consent = rules.find((rule) => rule.source === "/oauth/consent")
    const referrerPolicy = consent?.headers.find(
      (header) => header.key === "Referrer-Policy"
    )?.value

    // `no-referrer` makes the browser send `Origin: null` on the same-origin
    // form POST, and /api/oauth/authorize/decision rejects that with 403.
    expect(referrerPolicy).toBe("same-origin")
  })

  it("does not restrict form-action, so the redirect to the client is not blocked", async () => {
    const rules = (await nextConfig.headers?.()) ?? []
    const csp = rules
      .find((rule) => rule.source === "/oauth/consent")
      ?.headers.find(
        (header) => header.key === "Content-Security-Policy"
      )?.value

    // Browsers apply form-action to the 303 that follows the consent POST, so
    // `form-action 'self'` stopped the code from reaching e.g. chatgpt.com.
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain("form-action")
  })
})

describe("next.config body limit", () => {
  it("lets attachment uploads through middleware", () => {
    // Middleware buffers request bodies and cuts them at 10 MB by default;
    // uploads are up to 25 MB (ADR 0010).
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe("30mb")
  })
})
