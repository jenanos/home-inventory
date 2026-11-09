import type { Prisma } from "@workspace/db"

import type { ApplicationContext } from "../context"
import { validationError } from "../mutations"

/** What an attachment can belong to. */
export const ATTACHMENT_TARGET_TYPES = ["plant", "bed", "project"] as const

export type AttachmentTargetType = (typeof ATTACHMENT_TARGET_TYPES)[number]

export type AttachmentTarget = {
  type: AttachmentTargetType
  id: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Norwegian resource names, for errors. */
export const TARGET_LABELS: Record<AttachmentTargetType, string> = {
  plant: "plante",
  bed: "bed",
  project: "prosjekt",
}

export function parseAttachmentTarget(
  type: unknown,
  id: unknown
): AttachmentTarget {
  if (
    typeof type !== "string" ||
    !(ATTACHMENT_TARGET_TYPES as readonly string[]).includes(type)
  ) {
    throw validationError(
      `Vedlegg kan bare knyttes til ${ATTACHMENT_TARGET_TYPES.join(", ")}.`
    )
  }
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    throw validationError("Ugyldig ID for vedlegget sitt mål.")
  }
  return { type: type as AttachmentTargetType, id }
}

/** The owner column on Attachment for a target. */
export function ownerColumn(target: AttachmentTarget) {
  switch (target.type) {
    case "plant":
      return { plantId: target.id }
    case "bed":
      return { bedId: target.id }
    case "project":
      return { projectId: target.id }
  }
}

/** Attachments of one target, inside the caller's household. */
export function targetWhere(
  context: ApplicationContext,
  target: AttachmentTarget
): Prisma.AttachmentWhereInput {
  return { householdId: context.householdId, ...ownerColumn(target) }
}

export function targetOf(attachment: {
  plantId: string | null
  bedId: string | null
  projectId: string | null
}): AttachmentTarget {
  if (attachment.plantId) return { type: "plant", id: attachment.plantId }
  if (attachment.bedId) return { type: "bed", id: attachment.bedId }
  return { type: "project", id: attachment.projectId as string }
}
