import { lookup as dnsLookup, type LookupAddress } from "node:dns"
import { request } from "node:https"
import { BlockList, isIP } from "node:net"

import { validationError } from "../mutations"
import { MAX_UPLOAD_BYTES } from "./processing"

/**
 * Downloads a file the user asked the server to fetch: a picture on the web,
 * or a file a chat client handed over as a download URL.
 *
 * Fetching user-supplied URLs is a server-side request forgery risk (plan
 * 11.17), so this is the only place the server does it, and only on an
 * explicit request:
 * - https only, on the default port, without credentials in the URL;
 * - the host must resolve to public addresses only, and the connection is
 *   pinned to the address that was checked, so DNS rebinding cannot swap in
 *   an internal one between the check and the connect;
 * - every redirect is checked the same way, at most three;
 * - bounded size and an absolute time limit for the whole download, and the
 *   body is only kept, never interpreted here; redirect and error bodies are
 *   not read at all.
 */

export const DOWNLOAD_TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 3

const blocked = new BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4")
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6")
}

/** True for loopback, private, link-local, CGNAT, documentation and similar. */
export function isNonPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return blocked.check(address, "ipv4")
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped?.[1]) return blocked.check(mapped[1], "ipv4")
    return blocked.check(address, "ipv6")
  }
  return true
}

export function parseDownloadUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw validationError("URL-en er ikke gyldig.")
  }
  if (url.protocol !== "https:") {
    throw validationError("Bare https-URL-er kan lastes ned.")
  }
  if (url.username || url.password) {
    throw validationError("URL-en kan ikke inneholde brukernavn eller passord.")
  }
  if (url.port && url.port !== "443") {
    throw validationError("URL-en må bruke standardporten for https.")
  }
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (isIP(host) && isNonPublicAddress(host)) {
    throw validationError("URL-en peker til en intern adresse.")
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    !host.includes(".")
  ) {
    throw validationError("URL-en peker til en intern adresse.")
  }
  return url
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number
) => void

/**
 * `lookup` for the request: resolves every address and refuses the host if
 * any of them is non-public, then connects to the checked address only.
 */
function publicOnlyLookup(
  hostname: string,
  options: { all?: boolean },
  callback: LookupCallback
) {
  dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, "")
    if (
      addresses.length === 0 ||
      addresses.some((entry) => isNonPublicAddress(entry.address))
    ) {
      const refused = Object.assign(
        new Error(`${hostname} resolves to a non-public address`),
        { code: "ENONPUBLIC" }
      )
      return callback(refused, "")
    }
    if (options.all) return callback(null, addresses)
    const [first] = addresses
    callback(null, first!.address, first!.family)
  })
}

export type DownloadedFile = {
  bytes: Uint8Array
  /** The name from Content-Disposition or the last path segment. */
  fileName: string | null
  /** Where the bytes came from after redirects. */
  finalUrl: string
}

function fileNameFrom(url: URL, disposition: string | undefined) {
  const star = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (star) {
    try {
      return decodeURIComponent(star)
    } catch {
      // Fall through to the plain parameter.
    }
  }
  const plain = disposition?.match(/filename="?([^";]+)"?/i)?.[1]
  if (plain) return plain
  const segment = url.pathname.split("/").filter(Boolean).pop()
  try {
    return segment ? decodeURIComponent(segment) : null
  } catch {
    return segment ?? null
  }
}

function getOnce(url: URL, deadline: number) {
  return new Promise<
    | { kind: "redirect"; location: string }
    | { kind: "file"; bytes: Uint8Array; disposition?: string }
  >((resolve, reject) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0)
      return reject(validationError("Nedlastingen tok for lang tid."))

    // Settles once, stops the deadline timer and closes the connection, so
    // nothing keeps downloading after the call has returned or failed.
    let settled = false
    const settle = (done: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      req.destroy()
      done()
    }
    const fail = (error: unknown) => settle(() => reject(error))

    // An absolute deadline: the socket timeout only measures inactivity, so a
    // server trickling bytes could otherwise hold the call open indefinitely.
    const timer = setTimeout(
      () => fail(validationError("Nedlastingen tok for lang tid.")),
      remaining
    )

    const req = request(
      url,
      {
        method: "GET",
        lookup: publicOnlyLookup as never,
        headers: {
          "User-Agent": "home-overview/1.0 (+attachment download)",
          Accept: "image/*,application/pdf;q=0.9,*/*;q=0.1",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0
        // The bodies of redirects and errors are untrusted and unbounded, so
        // they are closed rather than drained.
        if (status >= 300 && status < 400 && res.headers.location) {
          const location = res.headers.location
          res.destroy()
          return settle(() => resolve({ kind: "redirect", location }))
        }
        if (status < 200 || status >= 300) {
          res.destroy()
          return fail(
            validationError(`Serveren svarte ${status} på nedlastingen.`)
          )
        }
        const declared = Number(res.headers["content-length"] ?? "0")
        if (declared > MAX_UPLOAD_BYTES) {
          res.destroy()
          return fail(validationError("Filen er for stor til å lastes ned."))
        }

        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (chunk: Buffer) => {
          size += chunk.byteLength
          if (size > MAX_UPLOAD_BYTES) {
            res.destroy()
            fail(validationError("Filen er for stor til å lastes ned."))
            return
          }
          chunks.push(chunk)
        })
        res.on("end", () =>
          settle(() =>
            resolve({
              kind: "file",
              bytes: new Uint8Array(Buffer.concat(chunks)),
              disposition: res.headers["content-disposition"],
            })
          )
        )
        res.on("error", () =>
          fail(validationError("Kunne ikke laste ned filen."))
        )
        // A connection that closes before the body ended is a failed download.
        res.on("close", () =>
          fail(validationError("Kunne ikke laste ned filen."))
        )
      }
    )
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENONPUBLIC") {
        fail(validationError("URL-en peker til en intern adresse."))
      } else if (error.code === "ENOTFOUND") {
        fail(validationError("Fant ikke serveren i URL-en."))
      } else if ("code" in error && error.code === "VALIDATION_ERROR") {
        fail(error)
      } else {
        fail(validationError("Kunne ikke laste ned filen."))
      }
    })
    req.end()
  })
}

export type Downloader = (url: string) => Promise<DownloadedFile>

export const downloadFile: Downloader = async (value) => {
  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS
  let url = parseDownloadUrl(value)

  for (let redirects = 0; ; redirects++) {
    const result = await getOnce(url, deadline)
    if (result.kind === "file") {
      return {
        bytes: result.bytes,
        fileName: fileNameFrom(url, result.disposition),
        finalUrl: url.toString(),
      }
    }
    if (redirects >= MAX_REDIRECTS) {
      throw validationError("For mange omdirigeringer.")
    }
    url = parseDownloadUrl(new URL(result.location, url).toString())
  }
}
