import type { ApplicationContext } from "@/lib/application/context"
import { listAttachments } from "@/lib/application/attachments/read"
import type { AttachmentTarget } from "@/lib/application/attachments/target"
import type { GalleryAttachment } from "@/components/attachments/attachment-gallery"

/** What the gallery needs, without timestamps or hashes. */
export async function getGalleryAttachments(
  context: ApplicationContext,
  target: AttachmentTarget
): Promise<GalleryAttachment[]> {
  const attachments = await listAttachments(context, target)
  return attachments.map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    fileName: attachment.fileName,
    caption: attachment.caption,
    byteSize: attachment.byteSize,
    width: attachment.width,
    height: attachment.height,
  }))
}
