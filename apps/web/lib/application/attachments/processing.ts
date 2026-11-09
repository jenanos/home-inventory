import { createHash } from "node:crypto"

import sharp from "sharp"

import { validationError } from "../mutations"

/**
 * Turns an uploaded file into what is stored. The file type comes from the
 * bytes, never from the name or the client's MIME type. Images are decoded and
 * re-encoded, which also drops EXIF metadata such as the GPS position a phone
 * camera writes into every photo.
 */

/** Largest file accepted before processing. Phone photos are 2–12 MB. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
/** Largest stored document. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
/** Longest edge of a stored image. Enough to zoom in on a phone or laptop. */
export const MAX_IMAGE_DIMENSION = 2560
/** Longest edge of the preview used in lists and cards. */
export const THUMBNAIL_DIMENSION = 480
/** Decompression-bomb guard: about a 100 megapixel image. */
const MAX_INPUT_PIXELS = 100_000_000
export const MAX_FILE_NAME_LENGTH = 200

export const IMAGE_CONTENT_TYPE = "image/webp"
export const PDF_CONTENT_TYPE = "application/pdf"

// Keeps memory predictable on a small server: one image at a time per call,
// and no decoded-image cache between requests.
sharp.concurrency(1)
sharp.cache(false)

export type DetectedFileType =
  | { kind: "IMAGE"; format: "jpeg" | "png" | "webp" | "gif" | "avif" }
  | { kind: "DOCUMENT"; format: "pdf" }
  | { kind: "UNSUPPORTED"; reason: "heic" | "unknown" }

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value)
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end))
}

export function detectFileType(bytes: Uint8Array): DetectedFileType {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { kind: "IMAGE", format: "jpeg" }
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: "IMAGE", format: "png" }
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return { kind: "IMAGE", format: "webp" }
  }
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return { kind: "IMAGE", format: "gif" }
  }
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12)
    if (brand === "avif" || brand === "avis") {
      return { kind: "IMAGE", format: "avif" }
    }
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return { kind: "UNSUPPORTED", reason: "heic" }
    }
  }
  // The PDF header may follow a few bytes of junk; readers accept that.
  if (ascii(bytes, 0, 1024).includes("%PDF-")) {
    return { kind: "DOCUMENT", format: "pdf" }
  }
  return { kind: "UNSUPPORTED", reason: "unknown" }
}

/**
 * A safe display name: no path, no control characters, bounded length. The
 * extension is replaced when the stored format differs from the upload.
 */
export function sanitizeFileName(
  name: string | null | undefined,
  extension: string
) {
  const base = (name ?? "")
    .split(/[\\/]/)
    .pop()!
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .trim()
  const stem = base.replace(/\.[^.]*$/, "").trim() || "fil"
  const maxStem = MAX_FILE_NAME_LENGTH - extension.length - 1
  return `${stem.slice(0, maxStem)}.${extension}`
}

export type ProcessedFile = {
  kind: "IMAGE" | "DOCUMENT"
  contentType: string
  fileName: string
  data: Buffer
  thumbnail: Buffer | null
  width: number | null
  height: number | null
  byteSize: number
  sha256: string
}

function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest("hex")
}

export async function processUpload(input: {
  bytes: Uint8Array
  fileName?: string | null
}): Promise<ProcessedFile> {
  const { bytes } = input
  if (bytes.byteLength === 0) {
    throw validationError("Filen er tom.")
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw validationError(
      `Filen er for stor. Maks ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
    )
  }

  const type = detectFileType(bytes)

  if (type.kind === "UNSUPPORTED") {
    throw validationError(
      type.reason === "heic"
        ? "HEIC-bilder støttes ikke. Last opp fra nettleseren på telefonen (den gjør dem om til JPEG), eller velg «Mest kompatibel» under Kamera → Formater på iPhone."
        : "Filtypen støttes ikke. Last opp et bilde (JPEG, PNG, WebP, GIF, AVIF) eller en PDF."
    )
  }

  if (type.kind === "DOCUMENT") {
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
      throw validationError(
        `PDF-en er for stor. Maks ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`
      )
    }
    const data = Buffer.from(bytes)
    return {
      kind: "DOCUMENT",
      contentType: PDF_CONTENT_TYPE,
      fileName: sanitizeFileName(input.fileName, "pdf"),
      data,
      thumbnail: null,
      width: null,
      height: null,
      byteSize: data.byteLength,
      sha256: sha256(data),
    }
  }

  try {
    // `rotate()` without arguments applies the EXIF orientation, so the
    // stored image is upright once the metadata is gone.
    const source = sharp(bytes, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    }).rotate()

    const { data, info } = await source
      .clone()
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })

    const thumbnail = await sharp(data)
      .resize({
        width: THUMBNAIL_DIMENSION,
        height: THUMBNAIL_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 70 })
      .toBuffer()

    return {
      kind: "IMAGE",
      contentType: IMAGE_CONTENT_TYPE,
      fileName: sanitizeFileName(input.fileName ?? "bilde", "webp"),
      data,
      thumbnail,
      width: info.width,
      height: info.height,
      byteSize: data.byteLength,
      sha256: sha256(data),
    }
  } catch {
    throw validationError("Bildet kunne ikke leses. Er filen skadet?")
  }
}

/**
 * A JPEG rendering for clients that should see the image but do not need the
 * stored resolution, such as an MCP client: small enough for a tool result.
 */
export async function renderPreview(
  data: Buffer,
  maxDimension: number
): Promise<Buffer> {
  return sharp(data)
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer()
}
