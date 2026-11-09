import { createHash, randomBytes } from "node:crypto"

import { db } from "@workspace/db"

import { getApplicationContext, type ApplicationContext } from "../context"
import { ApplicationError, isApplicationError } from "../errors"
import { optionalText } from "../mutations"
import { assertTargetInHousehold, createAttachment } from "./write"
import {
  parseAttachmentTarget,
  type AttachmentTarget,
  type AttachmentTargetType,
} from "./target"

/**
 * Upload links (ADR 0011). The token is the credential, like a password reset
 * link: 256 random bits, shown once, stored only as a SHA-256 hash, valid for
 * a short time and a bounded number of files, and bound to one target in one
 * household. Uploads still run as the user who created the link, through the
 * same service as the web app, so every household check applies again.
 */

export const UPLOAD_LINK_TTL_MINUTES = 30
export const UPLOAD_LINK_MAX_FILES = 20

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export async function createUploadLink(
  context: ApplicationContext,
  target: AttachmentTarget,
  options: {
    caption?: string | null
    clientId?: string | null
    now?: Date
  } = {}
) {
  await assertTargetInHousehold(db, context, target)
  const caption = optionalText(options.caption, "Bildetekst") ?? null

  const token = randomBytes(32).toString("base64url")
  const now = options.now ?? new Date()
  const expiresAt = new Date(now.getTime() + UPLOAD_LINK_TTL_MINUTES * 60_000)

  await db.attachmentUploadLink.create({
    data: {
      tokenHash: hashToken(token),
      householdId: context.householdId,
      createdById: context.userId,
      targetType: target.type,
      targetId: target.id,
      caption,
      maxFiles: UPLOAD_LINK_MAX_FILES,
      clientId: options.clientId ?? null,
      expiresAt,
    },
  })

  return { token, expiresAt, maxFiles: UPLOAD_LINK_MAX_FILES }
}

function expiredLink() {
  return new ApplicationError(
    "NOT_FOUND",
    "Lenken er ugyldig, utløpt eller brukt opp. Be om en ny."
  )
}

/** A token that is not even the right shape never reaches the database. */
function isTokenShaped(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token)
}

export type ActiveUploadLink = {
  target: AttachmentTarget
  targetName: string
  caption: string | null
  expiresAt: Date
  remainingFiles: number
}

async function targetName(
  target: AttachmentTarget,
  householdId: string
): Promise<string | null> {
  const where = { id: target.id, householdId }
  switch (target.type) {
    case "plant":
      return (
        (await db.plant.findFirst({ where, select: { name: true } }))?.name ??
        null
      )
    case "bed":
      return (
        (await db.gardenBed.findFirst({ where, select: { name: true } }))
          ?.name ?? null
      )
    case "project":
      return (
        (await db.project.findFirst({ where, select: { title: true } }))
          ?.title ?? null
      )
  }
}

/** What the upload page shows, or null when the link cannot be used. */
export async function getActiveUploadLink(
  token: string,
  now: Date = new Date()
): Promise<ActiveUploadLink | null> {
  if (!isTokenShaped(token)) return null
  const link = await db.attachmentUploadLink.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (!link || link.expiresAt <= now || link.usedCount >= link.maxFiles) {
    return null
  }

  const target = parseAttachmentTarget(link.targetType, link.targetId)
  const name = await targetName(target, link.householdId)
  if (!name) return null

  return {
    target,
    targetName: name,
    caption: link.caption,
    expiresAt: link.expiresAt,
    remainingFiles: link.maxFiles - link.usedCount,
  }
}

/**
 * Stores one file through the link. A slot is claimed atomically first, so
 * parallel uploads cannot exceed `maxFiles`; a failed upload gives it back.
 */
export async function uploadWithLink(
  token: string,
  file: { bytes: Uint8Array; fileName?: string | null },
  now: Date = new Date()
) {
  if (!isTokenShaped(token)) throw expiredLink()
  const tokenHash = hashToken(token)

  const link = await db.attachmentUploadLink.findUnique({
    where: { tokenHash },
  })
  if (!link) throw expiredLink()

  const claimed = await db.attachmentUploadLink.updateMany({
    where: {
      tokenHash,
      expiresAt: { gt: now },
      usedCount: { lt: link.maxFiles },
    },
    data: { usedCount: { increment: 1 } },
  })
  if (claimed.count === 0) throw expiredLink()

  try {
    // The creator must still be a member of the household the link is for.
    const context = await getApplicationContext(link.createdById)
    if (context.householdId !== link.householdId) throw expiredLink()

    const target = parseAttachmentTarget(link.targetType, link.targetId)
    const attachment = await createAttachment(context, target, {
      bytes: file.bytes,
      fileName: file.fileName,
      caption: link.caption,
      source: "UPLOAD_LINK",
    })
    return { attachment, target }
  } catch (error) {
    await db.attachmentUploadLink.updateMany({
      where: { tokenHash, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    })
    if (isApplicationError(error) && error.code === "FORBIDDEN") {
      throw expiredLink()
    }
    throw error
  }
}

/** Housekeeping: expired links are useless; every read checks expiry anyway. */
export async function deleteExpiredUploadLinks(now: Date = new Date()) {
  const result = await db.attachmentUploadLink.deleteMany({
    where: { expiresAt: { lt: now } },
  })
  return result.count
}

export type { AttachmentTargetType }
