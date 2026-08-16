import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"

import {
  formatScopeParameter,
  parseScopeParameter,
  type McpScope,
} from "./scopes"

/**
 * The algorithm is a constant, never read from the token header. A token whose
 * header says anything but `HS256`/`JWT` is rejected before the signature is
 * even considered, so `alg: none` and algorithm confusion are not reachable.
 */
const ALGORITHM = "HS256"
const TOKEN_TYPE = "JWT"

export type AccessTokenClaims = {
  iss: string
  sub: string
  aud: string
  scope: string
  client_id: string
  jti: string
  iat: number
  exp: number
}

export type IssueAccessTokenInput = {
  issuer: string
  resource: string
  signingSecret: string
  userId: string
  clientId: string
  scopes: readonly McpScope[]
  expiresInSeconds: number
  now?: Date
  jti?: string
}

export type VerifyAccessTokenInput = {
  token: string
  issuer: string
  resource: string
  signingSecret: string
  clockSkewSeconds: number
  now?: Date
}

export type AccessTokenVerificationFailure =
  | "malformed"
  | "unsupported-algorithm"
  | "invalid-signature"
  | "invalid-claims"
  | "issuer-mismatch"
  | "audience-mismatch"
  | "expired"
  | "not-yet-valid"

export type VerifyAccessTokenResult =
  | {
      ok: true
      claims: AccessTokenClaims
      scopes: McpScope[]
    }
  | {
      ok: false
      reason: AccessTokenVerificationFailure
    }

function encodeSegment(value: object) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

function sign(signingInput: string, secret: string) {
  return createHmac("sha256", secret).update(signingInput).digest("base64url")
}

export function issueAccessToken(input: IssueAccessTokenInput): {
  token: string
  claims: AccessTokenClaims
} {
  const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000)
  const claims: AccessTokenClaims = {
    iss: input.issuer,
    sub: input.userId,
    aud: input.resource,
    scope: formatScopeParameter(input.scopes),
    client_id: input.clientId,
    jti: input.jti ?? randomUUID(),
    iat: issuedAt,
    exp: issuedAt + input.expiresInSeconds,
  }

  const signingInput = `${encodeSegment({
    alg: ALGORITHM,
    typ: TOKEN_TYPE,
  })}.${encodeSegment(claims)}`

  return {
    token: `${signingInput}.${sign(signingInput, input.signingSecret)}`,
    claims,
  }
}

function decodeSegment(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"))
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function signaturesMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  )
}

export function verifyAccessToken(
  input: VerifyAccessTokenInput
): VerifyAccessTokenResult {
  const segments = input.token.split(".")
  if (segments.length !== 3) {
    return { ok: false, reason: "malformed" }
  }

  const [headerSegment, payloadSegment, signature] = segments as [
    string,
    string,
    string,
  ]
  const header = decodeSegment(headerSegment)

  if (!isRecord(header)) {
    return { ok: false, reason: "malformed" }
  }

  if (header.alg !== ALGORITHM || (header.typ && header.typ !== TOKEN_TYPE)) {
    return { ok: false, reason: "unsupported-algorithm" }
  }

  const expectedSignature = sign(
    `${headerSegment}.${payloadSegment}`,
    input.signingSecret
  )
  if (!signaturesMatch(expectedSignature, signature)) {
    return { ok: false, reason: "invalid-signature" }
  }

  const payload = decodeSegment(payloadSegment)
  if (!isRecord(payload)) {
    return { ok: false, reason: "malformed" }
  }

  const { iss, sub, aud, scope, client_id: clientId, jti, iat, exp } = payload

  if (
    typeof iss !== "string" ||
    typeof sub !== "string" ||
    typeof aud !== "string" ||
    typeof scope !== "string" ||
    typeof clientId !== "string" ||
    typeof jti !== "string" ||
    typeof iat !== "number" ||
    typeof exp !== "number"
  ) {
    return { ok: false, reason: "invalid-claims" }
  }

  if (iss !== input.issuer) {
    return { ok: false, reason: "issuer-mismatch" }
  }

  if (aud !== input.resource) {
    return { ok: false, reason: "audience-mismatch" }
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000)
  if (exp + input.clockSkewSeconds <= nowSeconds) {
    return { ok: false, reason: "expired" }
  }

  if (iat - input.clockSkewSeconds > nowSeconds) {
    return { ok: false, reason: "not-yet-valid" }
  }

  const { scopes, unknown } = parseScopeParameter(scope)
  if (unknown.length > 0) {
    return { ok: false, reason: "invalid-claims" }
  }

  return {
    ok: true,
    claims: { iss, sub, aud, scope, client_id: clientId, jti, iat, exp },
    scopes,
  }
}
