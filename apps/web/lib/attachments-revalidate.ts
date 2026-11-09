import type { AttachmentTarget } from "@/lib/application/attachments/target"

/** The pages that show a target's attachments. */
export function attachmentTargetPaths(target: AttachmentTarget): string[] {
  switch (target.type) {
    case "plant":
      return ["/hage", `/hage/${target.id}`]
    case "bed":
      return ["/hage", "/hage/bed", `/hage/bed/${target.id}`]
    case "project":
      return ["/prosjekter", `/prosjekter/${target.id}`]
  }
}

export function revalidateAttachmentTarget(
  target: AttachmentTarget,
  revalidate: (path: string) => void
) {
  for (const path of attachmentTargetPaths(target)) revalidate(path)
}
