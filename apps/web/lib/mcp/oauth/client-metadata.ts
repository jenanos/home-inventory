import { isIPv4, isIPv6 } from "node:net"

import { validateRedirectUri } from "./redirect-uri"

export const MAX_CLIENT_NAME_LENGTH = 200
export const MAX_REDIRECT_URIS = 5
export const MAX_CLIENT_METADATA_BYTES = 16 * 1024

export const SUPPORTED_GRANT_TYPES = [
  "authorization_code",
  "refresh_token",
] as const
export const SUPPORTED_RESPONSE_TYPES = ["code"] as const

/**
 * Only public clients are supported. Home Overview never issues client
 * secrets, so a client that insists on authenticating at the token endpoint is
 * rejected at registration rather than failing later.
 */
export const SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS = ["none"] as const

export type ClientMetadata = {
  clientName: string
  redirectUris: string[]
  grantTypes: string[]
  responseTypes: string[]
}

export type ClientMetadataRejection = {
  field: string
  message: string
}

export type ClientMetadataResult =
  | { ok: true; metadata: ClientMetadata }
  | { ok: false; rejection: ClientMetadataRejection }

function reject(field: string, message: string): ClientMetadataResult {
  return { ok: false, rejection: { field, message } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  return value.every((entry) => typeof entry === "string")
    ? (value as string[])
    : null
}

function isSupportedAuthMethod(method: string) {
  return (SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS as readonly string[]).includes(
    method
  )
}

/**
 * A client may list several methods it can use in the plural
 * `token_endpoint_auth_methods_supported` and keep the singular
 * `token_endpoint_auth_method` as a legacy preference. ChatGPT's CIMD document
 * does exactly that (`private_key_jwt` preferred, `none` also offered) and then
 * picks from the intersection with our metadata. So when the plural field is
 * present it decides, and the singular one is only a preference; without it,
 * the singular field is binding as in RFC 7591.
 */
function checkTokenEndpointAuthMethod(
  document: Record<string, unknown>
): ClientMetadataResult | null {
  const rejection = reject(
    "token_endpoint_auth_method",
    "Serveren utsteder ikke klienthemmeligheter; bruk token_endpoint_auth_method=none."
  )

  const offered = document.token_endpoint_auth_methods_supported
  if (offered !== undefined) {
    const methods = readStringArray(offered)
    if (!methods) {
      return reject(
        "token_endpoint_auth_methods_supported",
        "token_endpoint_auth_methods_supported må være en liste med strenger."
      )
    }
    return methods.some(isSupportedAuthMethod) ? null : rejection
  }

  const preferred = document.token_endpoint_auth_method
  if (preferred !== undefined && !isSupportedAuthMethod(String(preferred))) {
    return rejection
  }

  return null
}

/**
 * Shared validation for both registration paths: an RFC 7591 request body and
 * a Client ID Metadata Document carry the same fields and must satisfy the
 * same redirect-URI rules.
 */
export function validateClientMetadata(
  document: unknown
): ClientMetadataResult {
  if (!isRecord(document)) {
    return reject("document", "Klientmetadata må være et JSON-objekt.")
  }

  const clientName = document.client_name
  if (typeof clientName !== "string" || clientName.trim().length === 0) {
    return reject("client_name", "client_name er påkrevd.")
  }

  if (clientName.length > MAX_CLIENT_NAME_LENGTH) {
    return reject(
      "client_name",
      `client_name kan være maksimalt ${MAX_CLIENT_NAME_LENGTH} tegn.`
    )
  }

  const redirectUris = readStringArray(document.redirect_uris)
  if (!redirectUris || redirectUris.length === 0) {
    return reject(
      "redirect_uris",
      "redirect_uris må være en ikke-tom liste med strenger."
    )
  }

  if (redirectUris.length > MAX_REDIRECT_URIS) {
    return reject(
      "redirect_uris",
      `Maksimalt ${MAX_REDIRECT_URIS} redirect-URI-er kan registreres.`
    )
  }

  for (const redirectUri of redirectUris) {
    const validation = validateRedirectUri(redirectUri)
    if (!validation.ok) {
      return reject(
        "redirect_uris",
        "Redirect-URI må bruke HTTPS, eventuelt http mot 127.0.0.1 eller [::1]."
      )
    }
  }

  const grantTypes = document.grant_types
    ? readStringArray(document.grant_types)
    : [...SUPPORTED_GRANT_TYPES]
  if (!grantTypes) {
    return reject("grant_types", "grant_types må være en liste med strenger.")
  }

  for (const grantType of grantTypes) {
    if (!(SUPPORTED_GRANT_TYPES as readonly string[]).includes(grantType)) {
      return reject(
        "grant_types",
        `Kun ${SUPPORTED_GRANT_TYPES.join(" og ")} støttes.`
      )
    }
  }

  if (!grantTypes.includes("authorization_code")) {
    return reject("grant_types", "grant_types må inneholde authorization_code.")
  }

  const responseTypes = document.response_types
    ? readStringArray(document.response_types)
    : [...SUPPORTED_RESPONSE_TYPES]
  if (!responseTypes) {
    return reject(
      "response_types",
      "response_types må være en liste med strenger."
    )
  }

  for (const responseType of responseTypes) {
    if (
      !(SUPPORTED_RESPONSE_TYPES as readonly string[]).includes(responseType)
    ) {
      return reject("response_types", "Kun response_type=code støttes.")
    }
  }

  const authMethodRejection = checkTokenEndpointAuthMethod(document)
  if (authMethodRejection) {
    return authMethodRejection
  }

  return {
    ok: true,
    metadata: {
      clientName: clientName.trim(),
      redirectUris: [...new Set(redirectUris)],
      grantTypes: [...new Set(grantTypes)],
      responseTypes: [...new Set(responseTypes)],
    },
  }
}

/**
 * A Client ID Metadata Document identifier is an HTTPS URL with a path
 * component. Everything else — including a bare origin — is treated as an
 * opaque, locally registered client id.
 */
export function isClientIdMetadataUrl(clientId: string) {
  let url: URL
  try {
    url = new URL(clientId)
  } catch {
    return false
  }

  return (
    url.protocol === "https:" &&
    url.pathname.length > 1 &&
    !url.hash &&
    !url.username &&
    !url.password
  )
}

function ipv4ToParts(address: string) {
  return address.split(".").map(Number)
}

/**
 * Blocks the address ranges an attacker would use to make the authorization
 * server fetch something on the private network (SSRF), per the Client ID
 * Metadata Document security considerations.
 */
export function isPrivateIpAddress(address: string): boolean {
  if (isIPv4(address)) {
    const [a = 0, b = 0, c = 0] = ipv4ToParts(address)

    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true
    if (a === 192 && b === 88 && c === 99) return true
    if (a === 198 && (b === 18 || b === 19)) return true
    if (a === 198 && b === 51 && c === 100) return true
    if (a === 203 && b === 0 && c === 113) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a >= 224) return true

    return false
  }

  if (!isIPv6(address)) {
    // Not an address literal at all; the caller resolves names separately.
    return true
  }

  const groups = expandIPv6(address.toLowerCase().replace(/^\[|\]$/g, ""))
  if (!groups) return true

  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const embedded = (high: number, low: number) =>
    `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`

  // Address forms that carry an IPv4 address inherit the IPv4 rules. The check
  // works on the expanded groups, not the text: `new URL()` and DNS both hand
  // back `::ffff:7f00:1`, never the dotted `::ffff:127.0.0.1`.
  const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0
  // ::/96 covers ::, ::1 and the deprecated IPv4-compatible form, none of
  // which is a public destination.
  if (firstFiveZero && g5 === 0) return true
  // ::ffff:0:0/96 IPv4-mapped.
  if (firstFiveZero && g5 === 0xffff)
    return isPrivateIpAddress(embedded(g6, g7))
  // 64:ff9b::/96 and 64:ff9b:1::/48 NAT64 translate to the embedded IPv4.
  if (g0 === 0x64 && g1 === 0xff9b) {
    return g2 === 1 || isPrivateIpAddress(embedded(g6, g7))
  }
  // 2002::/16 6to4 embeds an IPv4 address in the next 32 bits.
  if (g0 === 0x2002) return isPrivateIpAddress(embedded(g1, g2))
  // 2001::/32 Teredo and 2001:db8::/32 documentation.
  if (g0 === 0x2001 && (g1 === 0 || g1 === 0xdb8)) return true

  // fc00::/7 unique local, fe80::/10 link local, ff00::/8 multicast.
  if ((g0 & 0xfe00) === 0xfc00) return true
  if ((g0 & 0xffc0) === 0xfe80) return true
  if ((g0 & 0xff00) === 0xff00) return true

  return false
}

/**
 * Expands an IPv6 literal (including a trailing dotted IPv4 part) into its
 * eight 16-bit groups. Returns null for anything that is not a valid literal,
 * which the caller treats as private.
 */
function expandIPv6(address: string): number[] | null {
  let text = address.split("%")[0] ?? ""

  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (dotted) {
    if (!isIPv4(dotted)) return null
    const [a = 0, b = 0, c = 0, d = 0] = ipv4ToParts(dotted)
    text =
      text.slice(0, -dotted.length) +
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }

  const halves = text.split("::")
  if (halves.length > 2) return null

  const parse = (part: string) =>
    part === ""
      ? []
      : part.split(":").map((group) => {
          if (!/^[0-9a-f]{1,4}$/.test(group)) return Number.NaN
          return parseInt(group, 16)
        })

  const head = parse(halves[0] ?? "")
  const tail = halves.length === 2 ? parse(halves[1] ?? "") : []
  const missing = 8 - head.length - tail.length

  if (halves.length === 1 ? missing !== 0 : missing < 1) return null

  const groups = [...head, ...Array<number>(missing).fill(0), ...tail]
  return groups.some(Number.isNaN) ? null : groups
}
