import { describe, expect, it } from "vitest"

import {
  buildOtpCallbackUrl,
  getSafeCallbackUrl,
  isValidOtpCode,
  normalizeOtpCode,
} from "./otp-utils"

describe("getSafeCallbackUrl", () => {
  it("keeps safe relative callback URLs", () => {
    expect(getSafeCallbackUrl("/dashboard")).toBe("/dashboard")
    expect(getSafeCallbackUrl(["/lists", "/ignored"])).toBe("/lists")
  })

  it("falls back to the homepage for unsafe callback URLs", () => {
    expect(getSafeCallbackUrl("https://example.com")).toBe("/")
    expect(getSafeCallbackUrl("//evil.example.com")).toBe("/")
    expect(getSafeCallbackUrl(undefined)).toBe("/")
  })
})

describe("normalizeOtpCode", () => {
  it("keeps only the first six digits", () => {
    expect(normalizeOtpCode("12a 34-5678")).toBe("123456")
  })
})

describe("isValidOtpCode", () => {
  it("accepts trimmed six-digit codes and rejects everything else", () => {
    expect(isValidOtpCode(" 123456 ")).toBe(true)
    expect(isValidOtpCode("12345")).toBe(false)
    expect(isValidOtpCode("12a456")).toBe(false)
  })
})

describe("buildOtpCallbackUrl", () => {
  it("builds the OTP callback URL with sanitized parameters", () => {
    expect(
      buildOtpCallbackUrl({
        origin: "https://home.example",
        token: " 123456 ",
        email: "user@example.com",
        callbackUrl: "https://evil.example",
      })
    ).toBe(
      "https://home.example/api/auth/callback/otp?token=123456&email=user%40example.com&callbackUrl=%2F"
    )
  })
})
