import { isApplicationError } from "@/lib/application/errors"

/**
 * HTTP helpers shared by the attachment routes. Kept out of the application
 * layer because they speak `Response`.
 */

const NO_STORE = { "Cache-Control": "no-store" }

export function jsonError(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: NO_STORE }
  )
}

const STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  FORBIDDEN: 403,
}

export function errorResponse(error: unknown) {
  if (isApplicationError(error)) {
    return jsonError(
      STATUS_BY_CODE[error.code] ?? 400,
      error.code,
      error.message
    )
  }
  console.error("Attachment request failed", error)
  return jsonError(500, "INTERNAL_ERROR", "Noe gikk galt.")
}

/**
 * Upload endpoints authenticate with a cookie, so a cross-site POST is refused
 * on top of SameSite=Lax. `fetch` always sends Origin on a POST.
 */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  const host = request.headers.get("host")
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** RFC 6266 filename, with an ASCII fallback for old clients. */
export function contentDisposition(
  type: "inline" | "attachment",
  fileName: string
) {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

/**
 * Serves stored bytes. The content type is one the server produced itself
 * (WebP or PDF), never one a client supplied; `nosniff` keeps the browser
 * from second-guessing it. Ids are never reused and content never changes,
 * so the browser may cache for a year, but only privately.
 */
export function fileResponse(
  bytes: Buffer,
  options: {
    contentType: string
    fileName: string
    sha256: string
    download: boolean
    request: Request
  }
) {
  const etag = `"${options.sha256}"`
  const headers: Record<string, string> = {
    "Content-Type": options.contentType,
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": contentDisposition(
      options.download ? "attachment" : "inline",
      options.fileName
    ),
    "Cross-Origin-Resource-Policy": "same-origin",
  }

  if (options.request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers })
  }

  headers["Content-Length"] = String(bytes.byteLength)
  return new Response(new Uint8Array(bytes), { status: 200, headers })
}
