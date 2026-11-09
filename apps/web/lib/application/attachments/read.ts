import { db, type Prisma } from "@workspace/db"

import type { ApplicationContext } from "../context"
import { targetWhere, type AttachmentTarget } from "./target"

/** Everything about an attachment except its bytes. */
export const attachmentSelect = {
  id: true,
  plantId: true,
  bedId: true,
  projectId: true,
  kind: true,
  fileName: true,
  contentType: true,
  byteSize: true,
  width: true,
  height: true,
  sha256: true,
  caption: true,
  sortOrder: true,
  source: true,
  sourceUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AttachmentSelect

export type AttachmentInfo = Prisma.AttachmentGetPayload<{
  select: typeof attachmentSelect
}>

export const attachmentOrder = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.AttachmentOrderByWithRelationInput[]

export async function listAttachments(
  context: ApplicationContext,
  target: AttachmentTarget
): Promise<AttachmentInfo[]> {
  return db.attachment.findMany({
    where: targetWhere(context, target),
    select: attachmentSelect,
    orderBy: attachmentOrder,
  })
}

export async function getAttachment(
  context: ApplicationContext,
  attachmentId: string
): Promise<AttachmentInfo | null> {
  return db.attachment.findFirst({
    where: { id: attachmentId, householdId: context.householdId },
    select: attachmentSelect,
  })
}

/**
 * The stored bytes, or the thumbnail. Only the requested column is read, so
 * a thumbnail request never loads the full image.
 */
export async function getAttachmentContent(
  context: ApplicationContext,
  attachmentId: string,
  variant: "full" | "thumbnail" = "full"
) {
  const attachment = await db.attachment.findFirst({
    where: { id: attachmentId, householdId: context.householdId },
    select: {
      ...attachmentSelect,
      content: {
        select: {
          data: variant === "full",
          thumbnail: variant === "thumbnail",
        },
      },
    },
  })
  if (!attachment?.content) return null

  const { content, ...info } = attachment
  const bytes = variant === "thumbnail" ? content.thumbnail : content.data

  // A document has no thumbnail; the caller falls back to an icon.
  if (!bytes) return null
  return { info, bytes: Buffer.from(bytes) }
}

/** Bytes used by all attachments in the household. */
export async function householdAttachmentBytes(context: ApplicationContext) {
  const result = await db.attachment.aggregate({
    where: { householdId: context.householdId },
    _sum: { byteSize: true },
  })
  return result._sum.byteSize ?? 0
}
