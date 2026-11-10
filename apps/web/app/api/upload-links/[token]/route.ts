import { revalidatePath } from "next/cache"

import { MAX_UPLOAD_BYTES } from "@/lib/application/attachments/processing"
import { uploadWithLink } from "@/lib/application/attachments/upload-links"
import { errorResponse, jsonError } from "@/lib/attachments-http"
import { revalidateAttachmentTarget } from "@/lib/attachments-revalidate"

/** Files per request; the link itself caps the total. */
const MAX_FILES_PER_REQUEST = 10

/**
 * POST /api/upload-links/:token
 *
 * The token in the path is the credential (ADR 0011), so there is no cookie
 * and no Origin check: an assistant's sandbox can upload with
 * `curl -F file=@photo.jpg <url>`. Either multipart with one or more `file`
 * fields, or the raw file as the body with its content type.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const length = Number(request.headers.get("content-length") ?? "0")
  if (length > MAX_UPLOAD_BYTES * MAX_FILES_PER_REQUEST) {
    return jsonError(413, "VALIDATION_ERROR", "Forespørselen er for stor.")
  }

  let files: Array<{ bytes: Uint8Array; fileName: string | null }>
  try {
    const contentType = request.headers.get("content-type") ?? ""
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData()
      const parts = form
        .getAll("file")
        .filter((value): value is File => value instanceof File)
      if (parts.length > MAX_FILES_PER_REQUEST) {
        return jsonError(
          400,
          "VALIDATION_ERROR",
          `Maks ${MAX_FILES_PER_REQUEST} filer per forespørsel.`
        )
      }
      files = await Promise.all(
        parts.map(async (part) => ({
          bytes: new Uint8Array(await part.arrayBuffer()),
          fileName: part.name || null,
        }))
      )
    } else {
      files = [
        {
          bytes: new Uint8Array(await request.arrayBuffer()),
          fileName: new URL(request.url).searchParams.get("filename"),
        },
      ]
    }
  } catch {
    return jsonError(400, "VALIDATION_ERROR", "Kunne ikke lese filen.")
  }

  if (
    files.length === 0 ||
    files.every((file) => file.bytes.byteLength === 0)
  ) {
    return jsonError(400, "VALIDATION_ERROR", "Ingen fil ble sendt.")
  }

  try {
    const uploaded = []
    for (const file of files) {
      const { attachment, target } = await uploadWithLink(token, file)
      revalidateAttachmentTarget(target, revalidatePath)
      uploaded.push({
        id: attachment.id,
        fileName: attachment.fileName,
        kind: attachment.kind,
      })
    }
    return Response.json(
      { attachments: uploaded },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return errorResponse(error)
  }
}
