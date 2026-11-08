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
})
