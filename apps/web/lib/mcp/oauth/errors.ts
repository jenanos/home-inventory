/**
 * OAuth 2.1 error responses. Descriptions are user-facing but never echo the
 * offending value back, so a malicious `client_id` or `redirect_uri` cannot be
 * reflected into a browser or a log line.
 */
export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "unsupported_response_type"
  | "invalid_scope"
  | "access_denied"
  | "server_error"
  | "temporarily_unavailable"
  | "invalid_redirect_uri"
  | "invalid_client_metadata"
  | "invalid_token"
  | "insufficient_scope"
  | "unsupported_token_type"

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const

export class OAuthError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    readonly description: string,
    readonly status: number = 400
  ) {
    super(`${code}: ${description}`)
    this.name = "OAuthError"
  }
}

export function oauthErrorResponse(
  error: OAuthError,
  extraHeaders: Record<string, string> = {}
) {
  return Response.json(
    {
      error: error.code,
      error_description: error.description,
    },
    {
      status: error.status,
      headers: { ...NO_STORE_HEADERS, ...extraHeaders },
    }
  )
}

export function oauthJsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { ...NO_STORE_HEADERS } })
}

/**
 * Errors that happen after the redirect URI is verified go back to the client
 * as a redirect, per OAuth 2.1 section 4.1.2.1. Errors before that point must
 * never redirect, because the URI is not yet trusted.
 *
 * `iss` is required here too (RFC 9207 section 2): the discovery document
 * advertises `authorization_response_iss_parameter_supported`, and clients
 * such as ChatGPT reject any authorization response, error or not, without it.
 */
export function oauthRedirectErrorResponse(
  redirectUri: string,
  error: OAuthErrorCode,
  description: string,
  issuer: string,
  state?: string | null
) {
  const target = new URL(redirectUri)
  target.searchParams.set("error", error)
  target.searchParams.set("error_description", description)
  target.searchParams.set("iss", issuer)
  if (state) {
    target.searchParams.set("state", state)
  }

  return noStoreRedirect(target.toString())
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

/**
 * Errors on the authorize endpoint reach a browser, not a JSON client. The page
 * is self-contained and escapes its only dynamic value, and a restrictive CSP
 * plus `X-Frame-Options` keeps it out of an attacker's frame.
 */
export function oauthBrowserErrorResponse(error: OAuthError) {
  const body = `<!doctype html>
<html lang="no">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tilkobling avvist &mdash; Hjemoversikt</title>
    <style>
      body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; margin: 0; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
      main { max-width: 480px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; }
      h1 { font-size: 20px; margin: 0 0 12px; }
      p { color: #475569; line-height: 1.5; margin: 0 0 8px; }
      code { background: #f1f5f9; border-radius: 4px; padding: 2px 6px; font-size: 13px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Tilkoblingen ble avvist</h1>
      <p>${escapeHtml(error.description)}</p>
      <p>Feilkode: <code>${escapeHtml(error.code)}</code></p>
      <p>Lukk dette vinduet og prøv å koble til på nytt fra klienten.</p>
    </main>
  </body>
</html>`

  return new Response(body, {
    status: error.status,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  })
}

/** `Response.redirect` cannot carry headers, and authorize responses must not be cached. */
export function noStoreRedirect(location: string, status = 302) {
  return new Response(null, {
    status,
    headers: { ...NO_STORE_HEADERS, Location: location },
  })
}
