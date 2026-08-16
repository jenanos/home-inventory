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

  if (!request.body) {
    return ""
  }

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let receivedBytes = 0
  let body = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    receivedBytes += value.byteLength
    if (receivedBytes > MAX_OAUTH_BODY_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new OAuthError("invalid_request", "Forespørselen er for stor.", 413)
    }

    body += decoder.decode(value, { stream: true })
  }

  return body + decoder.decode()
}

/** RFC 6749 requires `application/x-www-form-urlencoded` on the token endpoint. */
export async function readFormBody(
  request: Request,
  options: { allowRepeatedParameters?: readonly string[] } = {}
) {
  assertContentType(request, "application/x-www-form-urlencoded")

  const form = new URLSearchParams(await readLimitedText(request))
  const allowedRepeated = new Set(options.allowRepeatedParameters ?? [])

  // OAuth request parameters are single-valued unless the endpoint explicitly
  // opts a field out (the consent form uses repeated `scope` checkboxes).
  // Rejecting duplicates prevents different parsers or proxies from choosing
  // different client_id, code, redirect_uri or token values.
  for (const key of new Set(form.keys())) {
    if (!allowedRepeated.has(key) && form.getAll(key).length > 1) {
      throw new OAuthError(
        "invalid_request",
        `Parameteren ${key} kan ikke oppgis flere ganger.`,
        400
      )
    }
  }

  return form
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
