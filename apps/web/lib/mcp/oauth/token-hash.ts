import { createHmac, randomBytes, randomUUID } from "node:crypto"

const OPAQUE_TOKEN_BYTES = 32
const TOKEN_HASH_DOMAIN = "home-overview:mcp-oauth-token:v1"

export function generateOpaqueToken() {
  return randomBytes(OPAQUE_TOKEN_BYTES).toString("base64url")
}

export function generateTokenFamilyId() {
  return randomUUID()
}

export function hashOpaqueToken(token: string, secret: string) {
  if (!token) {
    throw new TypeError("Token must not be empty")
  }

  if (!secret) {
    throw new TypeError("Token hash secret must not be empty")
  }

  return createHmac("sha256", secret)
    .update(TOKEN_HASH_DOMAIN)
    .update("\0")
    .update(token)
    .digest("hex")
}
