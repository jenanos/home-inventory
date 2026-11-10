import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { db } from "@workspace/db"
import { z } from "zod"

import {
  downloadFile,
  type Downloader,
} from "../../application/attachments/download"
import { renderPreview } from "../../application/attachments/processing"
import {
  getAttachment,
  getAttachmentContent,
  listAttachments,
  type AttachmentInfo,
} from "../../application/attachments/read"
import {
  ATTACHMENT_TARGET_TYPES,
  targetOf,
  type AttachmentTarget,
  type AttachmentTargetType,
} from "../../application/attachments/target"
import {
  UPLOAD_LINK_MAX_FILES,
  UPLOAD_LINK_TTL_MINUTES,
  createUploadLink,
} from "../../application/attachments/upload-links"
import {
  assertTargetInHousehold,
  createAttachment,
  deleteAttachment,
  moveAttachmentFirst,
  updateAttachment,
} from "../../application/attachments/write"
import { ApplicationError } from "../../application/errors"
import {
  MAX_SHORT_TEXT_LENGTH,
  MAX_URL_LENGTH,
} from "../../application/mutations"
import { sessionHasScope, type McpSession } from "../auth/session"
import { mcpConfig } from "../config"
import type { McpScope } from "../oauth/scopes"
import { toolSuccess } from "../result"
import {
  CREATE_ANNOTATIONS,
  DELETE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  UPDATE_ANNOTATIONS,
  defineTool,
  defineWriteTool,
  type McpToolDefinition,
} from "./define"
import {
  assertId,
  expectedUpdatedAtSchema,
  idSchema,
  parseExpectedUpdatedAt,
  timestamp,
  timestampSchema,
} from "./shared"

/*
 * Attachments (ADR 0010, 0011) belong to plants and beds (garden) or to
 * projects (maintenance). Each tool is visible with either domain's scope and
 * checks the domain of the target on every call.
 */

const TARGET_DOMAIN: Record<AttachmentTargetType, "garden" | "maintenance"> = {
  plant: "garden",
  bed: "garden",
  project: "maintenance",
}

const READ_SCOPES = ["garden:read", "maintenance:read"] as const
const WRITE_SCOPES = ["garden:write", "maintenance:write"] as const

function assertTargetScope(
  session: McpSession,
  target: AttachmentTarget,
  access: "read" | "write"
) {
  const scope = `${TARGET_DOMAIN[target.type]}:${access}` as McpScope
  if (!sessionHasScope(session, scope)) {
    throw new ApplicationError(
      "SCOPE_REQUIRED",
      `Dette verktøyet krever scope ${scope} for ${target.type}.`
    )
  }
}

/** The attachment, after checking the caller may act on its target. */
async function loadAttachment(
  session: McpSession,
  attachmentId: string,
  access: "read" | "write"
) {
  assertId(attachmentId, "attachmentId")
  const attachment = await getAttachment(session.context, attachmentId)
  if (!attachment) {
    throw new ApplicationError("NOT_FOUND", "Fant ingen vedlegg med den ID-en.")
  }
  assertTargetScope(session, targetOf(attachment), access)
  return attachment
}

function publicOrigin() {
  return mcpConfig.enabled ? mcpConfig.issuer.replace(/\/$/, "") : ""
}

function appPath(target: AttachmentTarget) {
  switch (target.type) {
    case "plant":
      return `/hage/${target.id}`
    case "bed":
      return `/hage/bed/${target.id}`
    case "project":
      return `/prosjekter/${target.id}`
  }
}

// ─── Schemas ────────────────────────────────────────────────────

const targetInputSchema = {
  targetType: z
    .enum(ATTACHMENT_TARGET_TYPES)
    .describe("What the file belongs to: a plant, a garden bed or a project."),
  targetId: idSchema.describe(
    "Id from list-plants, list-garden-beds or list-projects."
  ),
}

const captionInputSchema = z
  .string()
  .max(MAX_SHORT_TEXT_LENGTH)
  .nullable()
  .optional()
  .describe("Short caption, e.g. 'In bloom, June 2026'.")

export const attachmentSchema = z.object({
  id: z.string(),
  targetType: z.enum(ATTACHMENT_TARGET_TYPES),
  targetId: z.string(),
  kind: z.enum(["IMAGE", "DOCUMENT"]),
  fileName: z.string(),
  contentType: z.string(),
  byteSize: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  caption: z.string().nullable(),
  sortOrder: z
    .number()
    .int()
    .describe("Display order. The first image is the cover picture."),
  source: z.enum(["UPLOAD", "UPLOAD_LINK", "MCP_FILE", "URL"]),
  sourceUrl: z.string().nullable(),
  appUrl: z
    .string()
    .describe("The page in the app where the user sees the file."),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export function serializeAttachment(
  attachment: AttachmentInfo
): z.infer<typeof attachmentSchema> {
  const target = targetOf(attachment)
  return {
    id: attachment.id,
    targetType: target.type,
    targetId: target.id,
    kind: attachment.kind,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    byteSize: attachment.byteSize,
    width: attachment.width,
    height: attachment.height,
    caption: attachment.caption,
    sortOrder: attachment.sortOrder,
    source: attachment.source,
    sourceUrl: attachment.sourceUrl,
    appUrl: `${publicOrigin()}${appPath(target)}`,
    createdAt: timestamp(attachment.createdAt),
    updatedAt: timestamp(attachment.updatedAt),
  }
}

// ─── Read ───────────────────────────────────────────────────────

export const listAttachmentsTool = defineTool({
  name: "list-attachments",
  scope: READ_SCOPES,
  title: "List attachments",
  description:
    "Lists the photos and documents (PDF) attached to one plant, garden bed or project, in display order. The first image is the cover picture. Use get-attachment to look at an image.",
  inputSchema: targetInputSchema,
  outputSchema: { attachments: z.array(attachmentSchema) },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    const target = { type: args.targetType, id: args.targetId }
    assertTargetScope(session, target, "read")
    const attachments = await listAttachments(session.context, target)

    return toolSuccess(
      { attachments: attachments.map(serializeAttachment) },
      `Fant ${attachments.length} vedlegg.`
    )
  },
})

const PREVIEW_SIZES = { small: 512, medium: 1024, large: 1568 } as const

export const getAttachmentTool = defineTool({
  name: "get-attachment",
  scope: READ_SCOPES,
  title: "Look at an attachment",
  description:
    "Returns one attachment's details and, for an image, the picture itself as a JPEG, so you can see the plant, bed or project, e.g. to identify a plant or judge its health. PDFs are returned as details only; the user opens them in the app (appUrl).",
  inputSchema: {
    attachmentId: idSchema.describe("Id from list-attachments."),
    size: z
      .enum(["small", "medium", "large"])
      .optional()
      .describe(
        "Longest edge of the returned image: small 512, medium 1024 (default), large 1568 px."
      ),
  },
  outputSchema: { attachment: attachmentSchema },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session): Promise<CallToolResult> => {
    const attachment = await loadAttachment(session, args.attachmentId, "read")
    const serialized = serializeAttachment(attachment)
    const label = attachment.caption ?? attachment.fileName

    if (attachment.kind !== "IMAGE") {
      return toolSuccess(
        { attachment: serialized },
        `${label}: PDF på ${Math.round(attachment.byteSize / 1024)} kB. Innholdet kan ikke vises her; brukeren åpner den på ${serialized.appUrl}.`
      )
    }

    const content = await getAttachmentContent(session.context, attachment.id)
    if (!content) {
      throw new ApplicationError(
        "NOT_FOUND",
        "Fant ingen vedlegg med den ID-en."
      )
    }
    const preview = await renderPreview(
      content.bytes,
      PREVIEW_SIZES[args.size ?? "medium"]
    )

    return {
      structuredContent: { attachment: serialized },
      content: [
        { type: "text", text: `Bilde: ${label}.` },
        {
          type: "image",
          data: preview.toString("base64"),
          mimeType: "image/jpeg",
        },
      ],
    }
  },
})

// ─── Write ──────────────────────────────────────────────────────

const writtenAttachmentOutput = { attachment: attachmentSchema }

export const createAttachmentUploadLinkTool = defineWriteTool({
  name: "create-attachment-upload-link",
  scope: WRITE_SCOPES,
  title: "Create an upload link",
  description: `Creates a link where photos or PDFs can be uploaded to one plant, garden bed or project, valid for ${UPLOAD_LINK_TTL_MINUTES} minutes and up to ${UPLOAD_LINK_MAX_FILES} files. Use it when the user wants to attach pictures or documents they have, including files they shared in this chat: if you can run code with network access and have the file, upload it yourself with a multipart POST (field "file") to uploadUrl, e.g. curl -F file=@photo.jpg <uploadUrl>; otherwise give the user pageUrl to open on their phone or computer. Treat the link like a password and do not show it to anyone else. Check the result with list-attachments.`,
  inputSchema: {
    ...targetInputSchema,
    caption: captionInputSchema.describe(
      "Caption applied to every file uploaded with this link."
    ),
  },
  outputSchema: {
    pageUrl: z
      .string()
      .describe("Upload page for the user to open in a browser."),
    uploadUrl: z
      .string()
      .describe('Endpoint for a multipart POST with the field "file".'),
    expiresAt: timestampSchema,
    maxFiles: z.number().int(),
  },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "attachment_upload_link",
  handler: async (args, session) => {
    const target = { type: args.targetType, id: args.targetId }
    assertTargetScope(session, target, "write")
    const link = await createUploadLink(session.context, target, {
      caption: args.caption,
      clientId: session.clientId,
    })
    const pageUrl = `${publicOrigin()}/opplasting/${link.token}`
    const uploadUrl = `${publicOrigin()}/api/upload-links/${link.token}`

    return {
      structuredContent: {
        pageUrl,
        uploadUrl,
        expiresAt: timestamp(link.expiresAt),
        maxFiles: link.maxFiles,
      },
      summary: `Opplastingslenke klar, gyldig i ${UPLOAD_LINK_TTL_MINUTES} minutter: ${pageUrl} (API: POST ${uploadUrl} med feltet "file").`,
      resourceId: target.id,
    }
  },
})

/**
 * Checks scope and that the target is in the household before anything is
 * downloaded, so a call for someone else's plant never makes a request.
 */
async function attachDownloaded(
  session: McpSession,
  target: AttachmentTarget,
  download: () => Promise<{ bytes: Uint8Array; fileName: string | null }>,
  options: {
    fileName?: string | null
    caption?: string | null
    source: "MCP_FILE" | "URL"
    sourceUrl?: string | null
  }
) {
  assertTargetScope(session, target, "write")
  await assertTargetInHousehold(db, session.context, target)
  const file = await download()
  return createAttachment(session.context, target, {
    bytes: file.bytes,
    fileName: options.fileName ?? file.fileName,
    caption: options.caption,
    source: options.source,
    sourceUrl: options.sourceUrl,
  })
}

/**
 * ChatGPT passes a file the user attached in the chat as an object with a
 * short-lived download URL when the tool lists the parameter under
 * `openai/fileParams` (Apps SDK). Other clients do not fill it in.
 */
export function createAttachUploadedFileTool(
  download: Downloader = downloadFile
) {
  return defineWriteTool({
    name: "attach-uploaded-file",
    scope: WRITE_SCOPES,
    title: "Attach a file from the chat",
    description:
      "Attaches an image or PDF the user shared in this chat to a plant, garden bed or project. Only for clients that pass chat files to tools as a file object with a download_url (e.g. ChatGPT); otherwise use create-attachment-upload-link. Images are resized and stripped of location data. Returns the saved attachment.",
    meta: { "openai/fileParams": ["file"] },
    inputSchema: {
      ...targetInputSchema,
      file: z
        .object({
          download_url: z.string().max(MAX_URL_LENGTH),
          file_id: z.string().max(200),
          mime_type: z.string().max(200).optional(),
          file_name: z.string().max(500).optional(),
        })
        .describe("The file the user attached in the chat."),
      caption: captionInputSchema,
    },
    outputSchema: writtenAttachmentOutput,
    annotations: CREATE_ANNOTATIONS,
    resourceType: "attachment",
    handler: async (args, session) => {
      const target = { type: args.targetType, id: args.targetId }
      const attachment = await attachDownloaded(
        session,
        target,
        () => download(args.file.download_url),
        {
          fileName: args.file.file_name,
          caption: args.caption,
          source: "MCP_FILE",
        }
      )

      return {
        structuredContent: { attachment: serializeAttachment(attachment) },
        summary: `La ved ${attachment.fileName}.`,
        resourceId: attachment.id,
      }
    },
  })
}

export function createAttachFileFromUrlTool(
  download: Downloader = downloadFile
) {
  return defineWriteTool({
    name: "attach-file-from-url",
    scope: WRITE_SCOPES,
    title: "Attach a file from the web",
    description:
      "Downloads a public image or PDF from an https URL and attaches a copy to a plant, garden bed or project, e.g. a reference photo of the species from Wikimedia Commons. Use the direct file URL, not a web page. Only when the user wants it, and respect the image's licence. The URL is kept as sourceUrl. Returns the saved attachment.",
    inputSchema: {
      ...targetInputSchema,
      url: z
        .string()
        .max(MAX_URL_LENGTH)
        .describe("Direct https URL of the image or PDF."),
      caption: captionInputSchema,
    },
    outputSchema: writtenAttachmentOutput,
    annotations: { ...CREATE_ANNOTATIONS, openWorldHint: true },
    resourceType: "attachment",
    handler: async (args, session) => {
      const target = { type: args.targetType, id: args.targetId }
      const attachment = await attachDownloaded(
        session,
        target,
        () => download(args.url),
        { caption: args.caption, source: "URL", sourceUrl: args.url }
      )

      return {
        structuredContent: { attachment: serializeAttachment(attachment) },
        summary: `La ved ${attachment.fileName} fra nettet.`,
        resourceId: attachment.id,
      }
    },
  })
}

export const updateAttachmentTool = defineWriteTool({
  name: "update-attachment",
  scope: WRITE_SCOPES,
  title: "Update an attachment",
  description:
    "Changes an attachment's caption, and with makeCover: true makes it the first one, i.e. the cover picture of its plant or bed. Returns the saved attachment.",
  inputSchema: {
    attachmentId: idSchema.describe("Id from list-attachments."),
    caption: captionInputSchema,
    makeCover: z
      .boolean()
      .optional()
      .describe("Move this attachment first, making it the cover picture."),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: writtenAttachmentOutput,
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "attachment",
  handler: async (args, session) => {
    await loadAttachment(session, args.attachmentId, "write")
    let attachment = await updateAttachment(
      session.context,
      args.attachmentId,
      {
        caption: args.caption,
        expectedUpdatedAt: parseExpectedUpdatedAt(args.expectedUpdatedAt),
      }
    )
    if (args.makeCover) {
      attachment = await moveAttachmentFirst(session.context, attachment.id)
    }

    return {
      structuredContent: { attachment: serializeAttachment(attachment) },
      summary: `Oppdaterte ${attachment.fileName}.`,
      resourceId: attachment.id,
    }
  },
})

export const deleteAttachmentTool = defineWriteTool({
  name: "delete-attachment",
  scope: WRITE_SCOPES,
  title: "Delete an attachment",
  description:
    "Permanently deletes one photo or document. Only what the user wants gone; confirm with the user first.",
  inputSchema: {
    attachmentId: idSchema.describe("Id from list-attachments."),
  },
  outputSchema: {
    deleted: z.object({ id: z.string(), fileName: z.string() }),
  },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "attachment",
  handler: async (args, session) => {
    await loadAttachment(session, args.attachmentId, "write")
    const deleted = await deleteAttachment(session.context, args.attachmentId)

    return {
      structuredContent: {
        deleted: { id: deleted.id, fileName: deleted.fileName },
      },
      summary: `Slettet ${deleted.fileName}.`,
      resourceId: deleted.id,
    }
  },
})

export function createAttachmentTools(
  download: Downloader = downloadFile
): McpToolDefinition[] {
  return [
    listAttachmentsTool,
    getAttachmentTool,
    createAttachmentUploadLinkTool,
    createAttachUploadedFileTool(download),
    createAttachFileFromUrlTool(download),
    updateAttachmentTool,
    deleteAttachmentTool,
  ]
}
