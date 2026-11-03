import { describe, expect, it } from "vitest"

import {
  MAX_OAUTH_BODY_BYTES,
  readFormBody,
  readJsonBody,
} from "./request-body"

function formRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("https://home.test/api/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body,
  })
}

describe("OAuth request bodies", () => {
  it("parses a bounded form body", async () => {
    const form = await readFormBody(
      formRequest("grant_type=authorization_code&code=abc")
    )

    expect(form.get("grant_type")).toBe("authorization_code")
    expect(form.get("code")).toBe("abc")
  })

  it("rejects duplicated singleton parameters", async () => {
    await expect(
      readFormBody(formRequest("client_id=first&client_id=second"))
    ).rejects.toMatchObject({
      code: "invalid_request",
      status: 400,
    })
  })

  it("allows only explicitly declared repeated parameters", async () => {
    const request = formRequest("scope=shopping%3Aread&scope=budget%3Aread")
    const form = await readFormBody(request, {
      allowRepeatedParameters: ["scope"],
    })

    expect(form.getAll("scope")).toEqual(["shopping:read", "budget:read"])
  })

  it("rejects an oversized declared body before reading it", async () => {
    await expect(
      readFormBody(
        formRequest("code=abc", {
          "content-length": String(MAX_OAUTH_BODY_BYTES + 1),
        })
      )
    ).rejects.toMatchObject({ status: 413 })
  })

  it("stops reading an oversized streamed body without a length header", async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("x".repeat(MAX_OAUTH_BODY_BYTES)))
        controller.enqueue(encoder.encode("x"))
        controller.close()
      },
    })
    const request = new Request("https://home.test/api/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" })

    await expect(readJsonBody(request)).rejects.toMatchObject({ status: 413 })
  })

  it("rejects the wrong content type", async () => {
    const request = new Request("https://home.test/api/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })

    await expect(readFormBody(request)).rejects.toMatchObject({ status: 415 })
  })
})
