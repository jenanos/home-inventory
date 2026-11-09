import { db } from "@workspace/db"
import sharp from "sharp"
import { afterAll, describe, expect, it } from "vitest"

import {
  downloadFile,
  isNonPublicAddress,
  parseDownloadUrl,
} from "../../application/attachments/download"
import {
  UPLOAD_LINK_MAX_FILES,
  createUploadLink,
  getActiveUploadLink,
  uploadWithLink,
} from "../../application/attachments/upload-links"
import { createGardenBed, createPlant } from "../../application/garden/write"
import { createProject } from "../../application/projects/write"
import { createHouseholdFixtures } from "../../test/household-fixtures"
import {
  createAttachFileFromUrlTool,
  createAttachUploadedFileTool,
} from "./attachments"
import { createToolRegistry } from "./index"

const fixtures = createHouseholdFixtures()

afterAll(async () => {
  await fixtures.cleanup()
  await db.$disconnect()
})

function tool(name: string) {
  const found = createToolRegistry().find((entry) => entry.name === name)
  if (!found) throw new Error(`Unknown tool ${name}`)
  return found
}

async function jpeg() {
  return sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#5a3" },
  })
    .jpeg()
    .toBuffer()
}

const PDF = Buffer.from("%PDF-1.4\n%%EOF\n", "latin1")

describe("download guard", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.18.0.5",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ])("treats %s as non-public", (address) => {
    expect(isNonPublicAddress(address)).toBe(true)
  })

  it.each(["1.1.1.1", "151.101.1.69", "2606:4700:4700::1111"])(
    "treats %s as public",
    (address) => {
      expect(isNonPublicAddress(address)).toBe(false)
    }
  )

  it.each([
    "http://example.com/a.jpg",
    "https://localhost/a.jpg",
    "https://home-overview-postgres/a",
    "https://127.0.0.1/a.jpg",
    "https://[::1]/a.jpg",
    "https://169.254.169.254/latest/meta-data",
    "https://user:pass@example.com/a.jpg",
    "https://example.com:8443/a.jpg",
    "file:///etc/passwd",
    "not a url",
  ])("refuses %s before connecting", (url) => {
    expect(() => parseDownloadUrl(url)).toThrow()
  })

  it("refuses an internal address without making a request", async () => {
    await expect(downloadFile("https://10.0.0.1/x.jpg")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    })
  })
})

describe("upload links", () => {
  it("lets the link holder upload to the target, as the user who made it", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Hosta" })
    const link = await createUploadLink(
      context,
      { type: "plant", id: plant.id },
      { caption: "Fra mobilen" }
    )

    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(await getActiveUploadLink(link.token)).toMatchObject({
      targetName: "Hosta",
      remainingFiles: UPLOAD_LINK_MAX_FILES,
    })

    const { attachment } = await uploadWithLink(link.token, {
      bytes: await jpeg(),
      fileName: "hosta.jpg",
    })
    expect(attachment).toMatchObject({
      plantId: plant.id,
      caption: "Fra mobilen",
      source: "UPLOAD_LINK",
    })
    // Only a hash is stored.
    expect(
      await db.attachmentUploadLink.count({ where: { tokenHash: link.token } })
    ).toBe(0)
    expect(await getActiveUploadLink(link.token)).toMatchObject({
      remainingFiles: UPLOAD_LINK_MAX_FILES - 1,
    })
  })

  it("refuses a target outside the household", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const plant = await createPlant(owner.context, { name: "Rose" })

    await expect(
      createUploadLink(other.context, { type: "plant", id: plant.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("stops working when expired, used up, or the creator left", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    const bed = await createGardenBed(context, { name: "Bed" })
    const target = { type: "bed", id: bed.id } as const

    const expired = await createUploadLink(context, target, {
      now: new Date(Date.now() - 31 * 60_000),
    })
    await expect(
      uploadWithLink(expired.token, { bytes: PDF })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(await getActiveUploadLink(expired.token)).toBeNull()

    const used = await createUploadLink(context, target)
    await db.attachmentUploadLink.updateMany({
      data: { usedCount: UPLOAD_LINK_MAX_FILES },
      where: { householdId },
    })
    await expect(
      uploadWithLink(used.token, { bytes: PDF })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    const orphaned = await createUploadLink(context, target)
    await db.householdMember.deleteMany({ where: { userId: context.userId } })
    await expect(
      uploadWithLink(orphaned.token, { bytes: PDF })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    // The failed upload gave its slot back.
    expect(
      (
        await db.attachmentUploadLink.findFirstOrThrow({
          where: { householdId, usedCount: { lt: UPLOAD_LINK_MAX_FILES } },
        })
      ).usedCount
    ).toBe(0)
  })

  it("rejects malformed and unknown tokens", async () => {
    await expect(
      uploadWithLink("../../etc", { bytes: PDF })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      uploadWithLink("A".repeat(43), { bytes: PDF })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("attachment MCP tools", () => {
  it("creates an upload link that uploads to the target", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Lavendel" })
    const session = fixtures.session(context, ["garden:write"])

    const result = await tool("create-attachment-upload-link").invoke(
      { targetType: "plant", targetId: plant.id },
      session
    )
    expect(result.isError).toBeUndefined()
    const { uploadUrl } = result.structuredContent as { uploadUrl: string }
    const token = uploadUrl.split("/opplasting/")[1]!
    await uploadWithLink(token, { bytes: await jpeg(), fileName: "a.jpg" })

    const listed = await tool("list-attachments").invoke(
      { targetType: "plant", targetId: plant.id },
      session
    )
    expect(listed.structuredContent).toMatchObject({
      attachments: [
        {
          targetType: "plant",
          targetId: plant.id,
          kind: "IMAGE",
          source: "UPLOAD_LINK",
        },
      ],
    })
  })

  it("checks the domain of the target, not just any attachment scope", async () => {
    const { context } = await fixtures.createHousehold()
    const project = await createProject(context, { title: "Tak" })
    const session = fixtures.session(context, ["garden:write"])

    const result = await tool("create-attachment-upload-link").invoke(
      { targetType: "project", targetId: project.id },
      session
    )
    expect(result.structuredContent).toMatchObject({
      error: { code: "SCOPE_REQUIRED" },
    })
    expect(
      await db.attachmentUploadLink.count({ where: { targetId: project.id } })
    ).toBe(0)
  })

  it("attaches a file from the web through the downloader and keeps its URL", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Hortensia" })
    const session = fixtures.session(context, ["garden:write"])
    const bytes = await jpeg()
    const requested: string[] = []
    const fromUrl = createAttachFileFromUrlTool(async (url) => {
      requested.push(url)
      return { bytes, fileName: "Hydrangea.jpg", finalUrl: url }
    })

    const result = await fromUrl.invoke(
      {
        targetType: "plant",
        targetId: plant.id,
        url: "https://upload.wikimedia.org/x/Hydrangea.jpg",
        caption: "Referansebilde",
      },
      session
    )

    expect(result.isError).toBeUndefined()
    expect(requested).toEqual(["https://upload.wikimedia.org/x/Hydrangea.jpg"])
    expect(result.structuredContent).toMatchObject({
      attachment: {
        fileName: "Hydrangea.webp",
        caption: "Referansebilde",
        source: "URL",
        sourceUrl: "https://upload.wikimedia.org/x/Hydrangea.jpg",
      },
    })
  })

  it("does not download for a target in another household", async () => {
    const owner = await fixtures.createHousehold()
    const intruder = await fixtures.createHousehold()
    const plant = await createPlant(owner.context, { name: "Eple" })
    let downloads = 0
    const uploaded = createAttachUploadedFileTool(async () => {
      downloads++
      return { bytes: PDF, fileName: "x.pdf", finalUrl: "https://x" }
    })

    const result = await uploaded.invoke(
      {
        targetType: "plant",
        targetId: plant.id,
        file: { download_url: "https://files.example/x", file_id: "file_1" },
      },
      fixtures.session(intruder.context, ["garden:write"])
    )

    expect(result.structuredContent).toMatchObject({
      error: { code: "NOT_FOUND" },
    })
    expect(await db.attachment.count({ where: { plantId: plant.id } })).toBe(0)
    expect(downloads).toBe(0)
  })

  it("marks the chat file parameter for ChatGPT", () => {
    expect(tool("attach-uploaded-file").meta).toEqual({
      "openai/fileParams": ["file"],
    })
  })

  it("shows an image to the model, and makes another image the cover", async () => {
    const { context } = await fixtures.createHousehold()
    const bed = await createGardenBed(context, { name: "Staudebed" })
    const session = fixtures.session(context, ["garden:write"])
    const fromUrl = createAttachFileFromUrlTool(async (url) => ({
      bytes: await jpeg(),
      fileName: "bed.jpg",
      finalUrl: url,
    }))
    const target = { targetType: "bed", targetId: bed.id }
    const first = await fromUrl.invoke(
      { ...target, url: "https://example.com/1.jpg" },
      session
    )
    const second = await fromUrl.invoke(
      { ...target, url: "https://example.com/2.jpg" },
      session
    )
    const secondId = (
      second.structuredContent as { attachment: { id: string } }
    ).attachment.id

    const shown = await tool("get-attachment").invoke(
      { attachmentId: secondId, size: "small" },
      session
    )
    expect(shown.isError).toBeUndefined()
    const image = shown.content?.find((part) => part.type === "image")
    expect(image).toMatchObject({ type: "image", mimeType: "image/jpeg" })
    const decoded = await sharp(
      Buffer.from((image as { data: string }).data, "base64")
    ).metadata()
    expect(Math.max(decoded.width!, decoded.height!)).toBe(512)

    await tool("update-attachment").invoke(
      { attachmentId: secondId, makeCover: true },
      session
    )
    const listed = await tool("list-attachments").invoke(target, session)
    expect(
      (
        listed.structuredContent as { attachments: Array<{ id: string }> }
      ).attachments.map((attachment) => attachment.id)
    ).toEqual([
      secondId,
      (first.structuredContent as { attachment: { id: string } }).attachment.id,
    ])

    const audit = await db.mcpAuditEvent.findFirstOrThrow({
      where: {
        correlationId: session.correlationId,
        toolName: "update-attachment",
      },
    })
    expect(audit).toMatchObject({
      resourceType: "attachment",
      outcome: "success",
    })
  })
})
