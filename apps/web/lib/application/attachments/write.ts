import { db, type AttachmentSource, type Prisma } from "@workspace/db"

import type { ApplicationContext } from "../context"
import { ApplicationError } from "../errors"
import {
  MAX_SHORT_TEXT_LENGTH,
  freshness,
  optionalText,
  optionalUrl,
  scopedWrite,
  validationError,
} from "../mutations"
import { processUpload } from "./processing"
import { attachmentOrder, attachmentSelect } from "./read"
import {
  TARGET_LABELS,
  ownerColumn,
  targetOf,
  targetWhere,
  type AttachmentTarget,
} from "./target"

const RESOURCE = "vedlegg"

/** Attachments per plant, bed or project. */
export const MAX_ATTACHMENTS_PER_TARGET = 100
/**
 * Total stored bytes per household. Far above what a household needs (ADR
 * 0010), but it keeps a misbehaving client from filling the database disk.
 */
export const MAX_HOUSEHOLD_ATTACHMENT_BYTES = 2 * 1024 * 1024 * 1024

/**
 * The target must be in the caller's household. Unknown and foreign ids get
 * the same NOT_FOUND (plan 9.4).
 */
export async function assertTargetInHousehold(
  tx: Prisma.TransactionClient,
  context: ApplicationContext,
  target: AttachmentTarget
) {
  const where = { id: target.id, householdId: context.householdId }
  const count =
    target.type === "plant"
      ? await tx.plant.count({ where })
      : target.type === "bed"
        ? await tx.gardenBed.count({ where })
        : await tx.project.count({ where })

  if (count === 0) {
    throw new ApplicationError(
      "NOT_FOUND",
      `Fant ingen ${TARGET_LABELS[target.type]} med den ID-en.`
    )
  }
}

export type CreateAttachmentInput = {
  bytes: Uint8Array
  fileName?: string | null
  caption?: string | null
  source?: AttachmentSource
  /** Where a downloaded file came from. Stored as data only. */
  sourceUrl?: string | null
}

export async function createAttachment(
  context: ApplicationContext,
  target: AttachmentTarget,
  input: CreateAttachmentInput
) {
  const caption = optionalText(input.caption, "Bildetekst") ?? null
  const sourceUrl = optionalUrl(input.sourceUrl, "Kilde-URL") ?? null

  // Processing is the slow part, so it runs before the transaction opens.
  const file = await processUpload({
    bytes: input.bytes,
    fileName: input.fileName,
  })

  return db.$transaction(
    async (tx) => {
      await assertTargetInHousehold(tx, context, target)

      const where = targetWhere(context, target)
      const [count, last, used] = await Promise.all([
        tx.attachment.count({ where }),
        tx.attachment.findFirst({
          where,
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        }),
        tx.attachment.aggregate({
          where: { householdId: context.householdId },
          _sum: { byteSize: true },
        }),
      ])

      if (count >= MAX_ATTACHMENTS_PER_TARGET) {
        throw validationError(
          `Maks ${MAX_ATTACHMENTS_PER_TARGET} vedlegg per ${TARGET_LABELS[target.type]}.`
        )
      }
      if (
        (used._sum.byteSize ?? 0) + file.byteSize >
        MAX_HOUSEHOLD_ATTACHMENT_BYTES
      ) {
        throw validationError(
          "Husstanden har brukt opp plassen til vedlegg. Slett noen først."
        )
      }

      return tx.attachment.create({
        data: {
          householdId: context.householdId,
          ...ownerColumn(target),
          kind: file.kind,
          fileName: file.fileName,
          contentType: file.contentType,
          byteSize: file.byteSize,
          width: file.width,
          height: file.height,
          sha256: file.sha256,
          caption,
          sortOrder: (last?.sortOrder ?? -1) + 1,
          source: input.source ?? "UPLOAD",
          sourceUrl,
          uploadedById: context.userId,
          content: {
            create: {
              data: new Uint8Array(file.data),
              thumbnail: file.thumbnail ? new Uint8Array(file.thumbnail) : null,
            },
          },
        },
        select: attachmentSelect,
      })
    },
    { timeout: 20_000, maxWait: 5_000 }
  )
}

export type UpdateAttachmentInput = {
  caption?: string | null
  fileName?: string
  expectedUpdatedAt?: Date
}

export async function updateAttachment(
  context: ApplicationContext,
  attachmentId: string,
  input: UpdateAttachmentInput
) {
  const scope = { id: attachmentId, householdId: context.householdId }
  const data: Prisma.AttachmentUpdateInput = {}
  if (input.caption !== undefined) {
    data.caption =
      optionalText(input.caption, "Bildetekst", MAX_SHORT_TEXT_LENGTH) ?? null
  }
  if (input.fileName !== undefined) {
    data.fileName = renamedFile(input.fileName)
  }

  return scopedWrite({
    resource: RESOURCE,
    expectedUpdatedAt: input.expectedUpdatedAt,
    write: () =>
      db.attachment.update({
        where: { ...scope, ...freshness(input.expectedUpdatedAt) },
        data,
        select: attachmentSelect,
      }),
    existsInScope: async () =>
      (await db.attachment.count({ where: scope })) > 0,
  })
}

/** A new display name keeps the stored file's extension. */
function renamedFile(name: string) {
  const trimmed = optionalText(name, "Filnavn")
  if (!trimmed) throw validationError("Filnavn kan ikke være tomt.")
  return trimmed
}

/**
 * Moves an attachment first among its siblings. The first image of a plant or
 * bed is its cover picture.
 */
export async function moveAttachmentFirst(
  context: ApplicationContext,
  attachmentId: string
) {
  return db.$transaction(async (tx) => {
    const attachment = await tx.attachment.findFirst({
      where: { id: attachmentId, householdId: context.householdId },
      select: { plantId: true, bedId: true, projectId: true },
    })
    if (!attachment) {
      throw new ApplicationError(
        "NOT_FOUND",
        `Fant ingen ${RESOURCE} med den ID-en.`
      )
    }

    const siblings = await tx.attachment.findMany({
      where: targetWhere(context, targetOf(attachment)),
      select: { id: true },
      orderBy: attachmentOrder,
    })
    const order = [
      attachmentId,
      ...siblings
        .map((sibling) => sibling.id)
        .filter((id) => id !== attachmentId),
    ]

    for (const [index, id] of order.entries()) {
      await tx.attachment.update({
        where: { id, householdId: context.householdId },
        data: { sortOrder: index },
      })
    }

    return tx.attachment.findFirstOrThrow({
      where: { id: attachmentId, householdId: context.householdId },
      select: attachmentSelect,
    })
  })
}

export async function deleteAttachment(
  context: ApplicationContext,
  attachmentId: string
) {
  return scopedWrite({
    resource: RESOURCE,
    write: () =>
      db.attachment.delete({
        where: { id: attachmentId, householdId: context.householdId },
        select: attachmentSelect,
      }),
  })
}
