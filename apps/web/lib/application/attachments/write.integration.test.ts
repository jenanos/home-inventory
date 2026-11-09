import { db } from "@workspace/db"
import sharp from "sharp"
import { afterAll, describe, expect, it } from "vitest"

import { createHouseholdFixtures } from "../../test/household-fixtures"
import { createGardenBed, createPlant } from "../garden/write"
import { createProject } from "../projects/write"
import {
  MAX_IMAGE_DIMENSION,
  detectFileType,
  processUpload,
} from "./processing"
import { getAttachmentContent, listAttachments } from "./read"
import {
  createAttachment,
  deleteAttachment,
  moveAttachmentFirst,
  updateAttachment,
} from "./write"

const fixtures = createHouseholdFixtures()

afterAll(async () => {
  await fixtures.cleanup()
  await db.$disconnect()
})

/** A phone-like photo: large, rotated by EXIF, with a GPS position. */
async function photoWithGps(width = 4000, height = 3000) {
  return sharp({
    create: { width, height, channels: 3, background: "#4a7" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: "TestPhone" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "59/1 54/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "10/1 45/1 0/1",
      },
    })
    .toBuffer()
}

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
  "latin1"
)

describe("attachment processing", () => {
  it("detects the type from the bytes, not the name", () => {
    expect(detectFileType(PDF)).toEqual({ kind: "DOCUMENT", format: "pdf" })
    expect(detectFileType(Buffer.from("....ftypheic....", "latin1"))).toEqual({
      kind: "UNSUPPORTED",
      reason: "heic",
    })
    expect(detectFileType(Buffer.from("<html><script>"))).toEqual({
      kind: "UNSUPPORTED",
      reason: "unknown",
    })
  })

  it("shrinks a photo, applies its orientation and strips EXIF and GPS", async () => {
    const bytes = await photoWithGps()
    const input = await sharp(bytes).metadata()
    expect(input.orientation).toBe(6)
    expect(input.exif?.includes(Buffer.from("TestPhone"))).toBe(true)

    const file = await processUpload({
      bytes,
      fileName: "IMG_1234.JPG",
    })

    expect(file).toMatchObject({
      kind: "IMAGE",
      contentType: "image/webp",
      fileName: "IMG_1234.webp",
      // Orientation 6 means rotated a quarter turn: portrait once applied.
      width: 1920,
      height: MAX_IMAGE_DIMENSION,
    })
    const metadata = await sharp(file.data).metadata()
    expect(metadata.format).toBe("webp")
    expect(metadata.exif).toBeUndefined()
    expect(metadata.orientation).toBeUndefined()

    const thumbnail = await sharp(file.thumbnail!).metadata()
    expect(Math.max(thumbnail.width!, thumbnail.height!)).toBe(480)
  })

  it("keeps a PDF as it is", async () => {
    const file = await processUpload({
      bytes: PDF,
      fileName: "../../tilbud.pdf",
    })
    expect(file).toMatchObject({
      kind: "DOCUMENT",
      contentType: "application/pdf",
      fileName: "tilbud.pdf",
      thumbnail: null,
    })
    expect(file.data.equals(PDF)).toBe(true)
  })

  it("rejects HEIC, unknown files and empty files with VALIDATION_ERROR", async () => {
    for (const bytes of [
      Buffer.from("....ftypheic....", "latin1"),
      Buffer.from("<svg onload=alert(1)>"),
      Buffer.alloc(0),
    ]) {
      await expect(processUpload({ bytes })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      })
    }
  })

  it("rejects an image that only claims to be one", async () => {
    const fake = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(64),
    ])
    await expect(processUpload({ bytes: fake })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    })
  })
})

describe("attachment services", () => {
  it("attaches files to a plant, a bed and a project in the household", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Hosta" })
    const bed = await createGardenBed(context, { name: "Staudebed" })
    const project = await createProject(context, { title: "Ny terrasse" })

    const image = await createAttachment(
      context,
      { type: "plant", id: plant.id },
      { bytes: await photoWithGps(800, 600), fileName: "hosta.jpg" }
    )
    await createAttachment(
      context,
      { type: "bed", id: bed.id },
      { bytes: await photoWithGps(800, 600), caption: "Våren 2026" }
    )
    const offer = await createAttachment(
      context,
      { type: "project", id: project.id },
      { bytes: PDF, fileName: "Tilbud.pdf" }
    )

    expect(image).toMatchObject({ plantId: plant.id, kind: "IMAGE" })
    expect(offer).toMatchObject({ projectId: project.id, kind: "DOCUMENT" })
    expect(
      await listAttachments(context, { type: "bed", id: bed.id })
    ).toMatchObject([{ caption: "Våren 2026", source: "UPLOAD" }])

    const thumbnail = await getAttachmentContent(context, image.id, "thumbnail")
    expect(thumbnail?.bytes.byteLength).toBeGreaterThan(0)
    // A document has no thumbnail.
    expect(
      await getAttachmentContent(context, offer.id, "thumbnail")
    ).toBeNull()
    const full = await getAttachmentContent(context, offer.id)
    expect(full?.bytes.equals(PDF)).toBe(true)
  })

  it("refuses a target in another household, and hides attachments from it", async () => {
    const owner = await fixtures.createHousehold()
    const intruder = await fixtures.createHousehold()
    const plant = await createPlant(owner.context, { name: "Rose" })

    await expect(
      createAttachment(
        intruder.context,
        { type: "plant", id: plant.id },
        { bytes: PDF }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    const attachment = await createAttachment(
      owner.context,
      { type: "plant", id: plant.id },
      { bytes: PDF }
    )
    expect(
      await getAttachmentContent(intruder.context, attachment.id)
    ).toBeNull()
    await expect(
      updateAttachment(intruder.context, attachment.id, { caption: "Stjålet" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      deleteAttachment(intruder.context, attachment.id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      moveAttachmentFirst(intruder.context, attachment.id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("orders by upload and moves a chosen image first", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Lavendel" })
    const target = { type: "plant", id: plant.id } as const
    const first = await createAttachment(context, target, {
      bytes: PDF,
      fileName: "a.pdf",
    })
    const second = await createAttachment(context, target, {
      bytes: PDF,
      fileName: "b.pdf",
    })
    const third = await createAttachment(context, target, {
      bytes: PDF,
      fileName: "c.pdf",
    })

    await moveAttachmentFirst(context, third.id)

    expect(
      (await listAttachments(context, target)).map((item) => item.id)
    ).toEqual([third.id, first.id, second.id])
  })

  it("updates a caption, and treats a stale expectedUpdatedAt as CONFLICT", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Hortensia" })
    const attachment = await createAttachment(
      context,
      { type: "plant", id: plant.id },
      { bytes: PDF }
    )

    const updated = await updateAttachment(context, attachment.id, {
      caption: " I blomst ",
    })
    expect(updated.caption).toBe("I blomst")

    await expect(
      updateAttachment(context, attachment.id, {
        caption: "Eldre",
        expectedUpdatedAt: attachment.updatedAt,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("deletes attachments and their bytes with the plant", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Tomat" })
    const attachment = await createAttachment(
      context,
      { type: "plant", id: plant.id },
      { bytes: PDF }
    )

    await db.plant.delete({ where: { id: plant.id } })

    expect(await db.attachment.count({ where: { id: attachment.id } })).toBe(0)
    expect(
      await db.attachmentContent.count({
        where: { attachmentId: attachment.id },
      })
    ).toBe(0)
  })

  it("rejects an attachment with two owners at the database level", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Eple" })
    const bed = await createGardenBed(context, { name: "Frukthage" })

    await expect(
      db.attachment.create({
        data: {
          householdId,
          plantId: plant.id,
          bedId: bed.id,
          kind: "DOCUMENT",
          fileName: "x.pdf",
          contentType: "application/pdf",
          byteSize: 1,
          sha256: "x",
        },
      })
    ).rejects.toThrow(/Attachment_one_owner_check/)
  })
})
