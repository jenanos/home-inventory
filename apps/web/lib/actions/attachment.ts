"use server"

import { revalidatePath } from "next/cache"

import { targetOf } from "@/lib/application/attachments/target"
import {
  deleteAttachment as deleteAttachmentService,
  moveAttachmentFirst,
  updateAttachment as updateAttachmentService,
} from "@/lib/application/attachments/write"
import { revalidateAttachmentTarget } from "@/lib/attachments-revalidate"
import { requireHousehold } from "@/lib/session"

// Uploads go through POST /api/attachments (they exceed the Server Action body
// limit). These are the small changes after the upload.

export async function updateAttachmentCaption(input: {
  id: string
  caption: string | null
}) {
  const { context } = await requireHousehold()
  const attachment = await updateAttachmentService(context, input.id, {
    caption: input.caption,
  })
  revalidateAttachmentTarget(targetOf(attachment), revalidatePath)
}

/** Makes the attachment the first one, i.e. the cover picture. */
export async function makeAttachmentCover(attachmentId: string) {
  const { context } = await requireHousehold()
  const attachment = await moveAttachmentFirst(context, attachmentId)
  revalidateAttachmentTarget(targetOf(attachment), revalidatePath)
}

export async function deleteAttachment(attachmentId: string) {
  const { context } = await requireHousehold()
  const attachment = await deleteAttachmentService(context, attachmentId)
  revalidateAttachmentTarget(targetOf(attachment), revalidatePath)
}
