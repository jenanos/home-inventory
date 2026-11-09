import { revalidatePath } from "next/cache"

import { MAX_UPLOAD_BYTES } from "@/lib/application/attachments/processing"
import { parseAttachmentTarget } from "@/lib/application/attachments/target"
import { createAttachment } from "@/lib/application/attachments/write"
import { errorResponse, isSameOrigin, jsonError } from "@/lib/attachments-http"
import { revalidateAttachmentTarget } from "@/lib/attachments-revalidate"
import { getHouseholdContextOrNull } from "@/lib/session"

/** Files per request. The client uploads one at a time anyway. */
const MAX_FILES_PER_REQUEST = 10

/**
 * POST /api/attachments (multipart/form-data)
 *
 * Fields: `targetType` (plant, bed or project), `targetId`, one or more
 * `file`, and an optional `caption`. A route handler rather than a Server
 * Action because uploads are far larger than the Server Action body limit.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError(403, "FORBIDDEN", "Opplasting må komme fra appen.")
  }

  const context = await getHouseholdContextOrNull()
  if (!context) {
    return jsonError(401, "UNAUTHORIZED", "Logg inn for å laste opp.")
  }

  const length = Number(request.headers.get("content-length") ?? "0")
  if (length > MAX_UPLOAD_BYTES * MAX_FILES_PER_REQUEST) {
    return jsonError(413, "VALIDATION_ERROR", "Forespørselen er for stor.")
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError(400, "VALIDATION_ERROR", "Ugyldig skjema.")
  }

  try {
    const target = parseAttachmentTarget(
      form.get("targetType"),
      form.get("targetId")
    )
    const files = form
      .getAll("file")
      .filter((value): value is File => value instanceof File)
    if (files.length === 0) {
      return jsonError(400, "VALIDATION_ERROR", "Ingen fil ble sendt.")
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return jsonError(
        400,
        "VALIDATION_ERROR",
        `Maks ${MAX_FILES_PER_REQUEST} filer per opplasting.`
      )
    }
    const caption = form.get("caption")

    const attachments = []
    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return jsonError(
          413,
          "VALIDATION_ERROR",
          `${file.name} er for stor. Maks ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
        )
      }
      attachments.push(
        await createAttachment(context, target, {
          bytes: new Uint8Array(await file.arrayBuffer()),
          fileName: file.name,
          caption: typeof caption === "string" ? caption : null,
          source: "UPLOAD",
        })
      )
    }

    revalidateAttachmentTarget(target, revalidatePath)
    return Response.json(
      {
        attachments: attachments.map(({ id, fileName, kind }) => ({
          id,
          fileName,
          kind,
        })),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return errorResponse(error)
  }
}
