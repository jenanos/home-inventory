import { describe, expect, it, vi } from "vitest"

vi.mock("@workspace/db", () => ({ db: {} }))

import { readBodyWithinLimit } from "./client-registry"

function streamingResponse(chunks: number, chunkBytes: number, headers = {}) {
  let sent = 0
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunks) {
        controller.close()
        return
      }
      sent += 1
      controller.enqueue(new Uint8Array(chunkBytes).fill(0x61))
    },
    cancel,
  })

  return {
    response: new Response(body, { headers }),
    cancel,
    sent: () => sent,
  }
}

describe("readBodyWithinLimit", () => {
  it("returns the body when it fits", async () => {
    const { response } = streamingResponse(2, 100)

    await expect(readBodyWithinLimit(response, 1024)).resolves.toBe(
      "a".repeat(200)
    )
  })

  it("stops reading and cancels the stream once the limit is passed", async () => {
    // 1000 chunks of 1 KiB would be ~1 MiB; the reader must give up after the
    // first chunk that crosses 16 KiB instead of buffering all of it.
    const stream = streamingResponse(1000, 1024)

    await expect(readBodyWithinLimit(stream.response, 16 * 1024)).resolves.toBe(
      null
    )
    expect(stream.cancel).toHaveBeenCalled()
    expect(stream.sent()).toBeLessThan(30)
  })

  it("refuses a declared content-length over the limit without reading", async () => {
    const stream = streamingResponse(1, 10, { "content-length": "999999" })

    await expect(readBodyWithinLimit(stream.response, 1024)).resolves.toBe(null)
    expect(stream.sent()).toBe(0)
  })

  it("counts bytes, not characters", async () => {
    // "ø" is two bytes in UTF-8: 600 characters are 1200 bytes.
    const response = new Response("ø".repeat(600))

    await expect(readBodyWithinLimit(response, 1000)).resolves.toBeNull()
  })
})
