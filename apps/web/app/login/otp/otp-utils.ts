export function getSafeCallbackUrl(callbackUrl?: string | string[]) {
  const value = Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl

  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/"
}

export function normalizeOtpCode(code: string) {
  return code.replace(/\D/g, "").slice(0, 6)
}

export function isValidOtpCode(code: string) {
  return /^\d{6}$/.test(code.trim())
}

export function buildOtpCallbackUrl({
  origin,
  token,
  email,
  callbackUrl,
}: {
  origin: string
  token: string
  email: string
  callbackUrl?: string | string[]
}) {
  const url = new URL("/api/auth/callback/otp", origin)
  url.searchParams.set("token", token.trim())
  url.searchParams.set("email", email)
  url.searchParams.set("callbackUrl", getSafeCallbackUrl(callbackUrl))
  return url.toString()
}
