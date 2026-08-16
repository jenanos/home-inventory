import { OAuthError } from "./errors"

export const MAX_OAUTH_BODY_BYTES = 16 * 1024

function assertContentType(request: Request, expected: string) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]

  if (contentType?.trim().toLowerCase() !== expected) {
    throw new OAuthError(
      "invalid_request",
      `Content-Type må være ${expected}.`,
      415
    )
  }
}

async function readLimitedText(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_OAUTH_BODY_BYTES
  ) {
    throw new OAuthError("invalid_request", "Forespørselen er for stor.", 413)
  }

  const body = await request.text()
  // The declared length can lie, so the actual body is checked as well.
  if (Buffer.byteLength(body, "utf8") > MAX_OAUTH_BODY_BYTES) {
    throw new OAuthError("invalid_request", "Forespørselen er for stor.", 413)
  }

  return body
}

/** RFC 6749 requires `application/x-www-form-urlencoded` on the token endpoint. */
export async function readFormBody(request: Request) {
  assertContentType(request, "application/x-www-form-urlencoded")

  return new URLSearchParams(await readLimitedText(request))
}

export async function readJsonBody(request: Request): Promise<unknown> {
  assertContentType(request, "application/json")

  const body = await readLimitedText(request)

  try {
    return JSON.parse(body)
  } catch {
    throw new OAuthError(
      "invalid_request",
      "Ugyldig JSON i forespørselen.",
      400
    )
  }
}
