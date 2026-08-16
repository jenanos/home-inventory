/**
 * Redirect-URI rules for the MCP authorization server.
 *
 * Registration accepts HTTPS URIs and the narrow RFC 8252 loopback exception:
 * `http` with the IP literals `127.0.0.1` or `[::1]`. `localhost` is rejected
 * because it can resolve to an address the user does not control, and because
 * the MCP specification's own security notes call loopback impersonation out
 * as a risk.
 *
 * Matching is exact on scheme, host, path and query. Only the port may differ,
 * and only for loopback URIs, because native clients bind an arbitrary free
 * port at runtime (RFC 8252 section 7.3).
 */

export type RedirectUriRejection =
  | "invalid-url"
  | "unsupported-scheme"
  | "http-outside-loopback"
  | "has-fragment"
  | "has-credentials"
  | "too-long"

export const MAX_REDIRECT_URI_LENGTH = 2048

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "[::1]"])

function parse(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function isLoopbackRedirectUri(url: URL) {
  return url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname)
}

export function validateRedirectUri(
  value: string
): { ok: true; url: URL } | { ok: false; reason: RedirectUriRejection } {
  if (value.length > MAX_REDIRECT_URI_LENGTH) {
    return { ok: false, reason: "too-long" }
  }

  const url = parse(value)
  if (!url) {
    return { ok: false, reason: "invalid-url" }
  }

  if (url.hash) {
    return { ok: false, reason: "has-fragment" }
  }

  if (url.username || url.password) {
    return { ok: false, reason: "has-credentials" }
  }

  if (url.protocol === "https:") {
    return { ok: true, url }
  }

  if (url.protocol === "http:") {
    return isLoopbackRedirectUri(url)
      ? { ok: true, url }
      : { ok: false, reason: "http-outside-loopback" }
  }

  return { ok: false, reason: "unsupported-scheme" }
}

/**
 * `URL.hostname` normalises `[::1]` to `[::1]`, but the comparison below is
 * done on the parsed components rather than the raw strings so that equivalent
 * spellings (default ports, percent-encoding) compare equal.
 */
function componentsMatch(requested: URL, registered: URL) {
  return (
    requested.protocol === registered.protocol &&
    requested.hostname === registered.hostname &&
    requested.pathname === registered.pathname &&
    requested.search === registered.search
  )
}

export function matchRedirectUri(
  requestedValue: string,
  registeredValues: readonly string[]
): { ok: true; redirectUri: string } | { ok: false } {
  const requested = validateRedirectUri(requestedValue)
  if (!requested.ok) {
    return { ok: false }
  }

  for (const registeredValue of registeredValues) {
    const registered = validateRedirectUri(registeredValue)
    if (!registered.ok) {
      continue
    }

    if (!componentsMatch(requested.url, registered.url)) {
      continue
    }

    // Exact match, including port.
    if (requested.url.port === registered.url.port) {
      return { ok: true, redirectUri: requested.url.toString() }
    }

    // RFC 8252 section 7.3: a native client may use any port on loopback.
    if (isLoopbackRedirectUri(requested.url)) {
      return { ok: true, redirectUri: requested.url.toString() }
    }
  }

  return { ok: false }
}
