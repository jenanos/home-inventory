import { getAttachmentContent } from "@/lib/application/attachments/read"
import { errorResponse, fileResponse, jsonError } from "@/lib/attachments-http"
import { getHouseholdContextOrNull } from "@/lib/session"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/attachments/:id[?variant=thumbnail][&download=1]
 *
 * Only members of the attachment's household can read it; anyone else gets
 * the same 404 as for an unknown id.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getHouseholdContextOrNull()
  if (!context) {
    return jsonError(401, "UNAUTHORIZED", "Logg inn for å se vedlegget.")
  }

  const { id } = await params
  if (!UUID_PATTERN.test(id)) {
    return jsonError(404, "NOT_FOUND", "Fant ikke vedlegget.")
  }

  const url = new URL(request.url)
  const variant =
    url.searchParams.get("variant") === "thumbnail" ? "thumbnail" : "full"

  try {
    const result = await getAttachmentContent(context, id, variant)
    if (!result) {
      return jsonError(404, "NOT_FOUND", "Fant ikke vedlegget.")
    }

    return fileResponse(result.bytes, {
      contentType:
        variant === "thumbnail" ? "image/webp" : result.info.contentType,
      fileName: result.info.fileName,
      // The thumbnail is a different representation, so it needs its own tag.
      sha256:
        variant === "thumbnail"
          ? `${result.info.sha256}-thumb`
          : result.info.sha256,
      download: url.searchParams.get("download") === "1",
      request,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
