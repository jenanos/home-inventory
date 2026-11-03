import { lookup } from "node:dns/promises"
import { randomBytes } from "node:crypto"
import { isIPv4, isIPv6 } from "node:net"

import { db, type McpOAuthClient, type PrismaClient } from "@workspace/db"

import {
  isClientIdMetadataUrl,
  isPrivateIpAddress,
  MAX_CLIENT_METADATA_BYTES,
  validateClientMetadata,
  type ClientMetadata,
} from "./client-metadata"
import { OAuthError } from "./errors"

/** Upper bound on concurrently registered, unrevoked dynamic clients. */
export const MAX_ACTIVE_DYNAMIC_CLIENTS = 25

/** How long an unused dynamic registration survives before cleanup removes it. */
export const DYNAMIC_REGISTRATION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Fallback cache lifetime when the metadata response has no usable cache headers. */
export const CLIENT_METADATA_CACHE_TTL_MS = 60 * 60 * 1000
export const CLIENT_METADATA_MAX_CACHE_TTL_MS = 24 * 60 * 60 * 1000
export const CLIENT_METADATA_FETCH_TIMEOUT_MS = 5_000

export type ResolvedClient = {
  clientId: string
  name: string
  redirectUris: string[]
  source: McpOAuthClient["registrationSource"]
}

type Fetcher = typeof fetch

type ClientRegistryOptions = {
  prisma?: PrismaClient
  fetchImpl?: Fetcher
  now?: () => Date
  resolveHost?: (hostname: string) => Promise<string[]>
}

async function defaultResolveHost(hostname: string) {
  const addresses = await lookup(hostname, { all: true })
  return addresses.map((entry) => entry.address)
}

function toResolvedClient(client: McpOAuthClient): ResolvedClient {
  return {
    clientId: client.id,
    name: client.name,
    redirectUris: client.redirectUris,
    source: client.registrationSource,
  }
}

export class McpOAuthClientRegistry {
  private readonly prisma: PrismaClient
  private readonly fetchImpl: Fetcher
  private readonly now: () => Date
  private readonly resolveHost: (hostname: string) => Promise<string[]>

  constructor(options: ClientRegistryOptions = {}) {
    this.prisma = options.prisma ?? db
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? (() => new Date())
    this.resolveHost = options.resolveHost ?? defaultResolveHost
  }

  /**
   * Resolves the client behind an authorization or token request.
   *
   * A URL-shaped `client_id` goes down the Client ID Metadata Document path and
   * is re-fetched when the cached copy is stale. Anything else must already
   * exist as a locally registered client.
   */
  async resolveClient(clientId: string): Promise<ResolvedClient> {
    if (clientId.length > 512) {
      throw new OAuthError("invalid_client", "Ukjent klient.", 401)
    }

    const existing = await this.prisma.mcpOAuthClient.findUnique({
      where: { id: clientId },
    })

    if (existing && existing.status !== "ACTIVE") {
      throw new OAuthError("invalid_client", "Klienten er tilbakekalt.", 401)
    }

    if (isClientIdMetadataUrl(clientId)) {
      return this.resolveClientIdMetadataDocument(clientId, existing)
    }

    if (!existing) {
      throw new OAuthError("invalid_client", "Ukjent klient.", 401)
    }

    // For a dynamic registration, `expiresAt` is the deadline for taking the
    // registration into use. It is cleared on first use, so an active client
    // never expires by itself.
    if (existing.expiresAt && existing.expiresAt <= this.now()) {
      throw new OAuthError(
        "invalid_client",
        "Klientregistreringen er utløpt. Registrer klienten på nytt.",
        401
      )
    }

    return toResolvedClient(existing)
  }

  private async resolveClientIdMetadataDocument(
    clientId: string,
    cached: McpOAuthClient | null
  ): Promise<ResolvedClient> {
    // For a CIMD client, `expiresAt` is the cache deadline for the fetched
    // document, not a registration expiry.
    const isFresh = cached?.expiresAt && cached.expiresAt > this.now()
    if (cached && isFresh) {
      return toResolvedClient(cached)
    }

    let document: { metadata: ClientMetadata; cacheUntil: Date }
    try {
      document = await this.fetchClientMetadataDocument(clientId)
    } catch (error) {
      // A stale-but-known client keeps working through a transient outage at
      // the client's own host; an unknown one cannot be authorized at all.
      if (cached) {
        return toResolvedClient(cached)
      }
      throw error
    }

    const data = {
      name: document.metadata.clientName,
      redirectUris: document.metadata.redirectUris,
      grantTypes: document.metadata.grantTypes,
      responseTypes: document.metadata.responseTypes,
      registrationSource: "CLIENT_ID_METADATA" as const,
      expiresAt: document.cacheUntil,
    }

    const client = await this.prisma.mcpOAuthClient.upsert({
      where: { id: clientId },
      create: { id: clientId, ...data },
      update: data,
    })

    return toResolvedClient(client)
  }

  private async assertPublicHost(url: URL) {
    const hostname = url.hostname.replace(/^\[|\]$/g, "")

    if (isIPv4(hostname) || isIPv6(hostname)) {
      if (isPrivateIpAddress(hostname)) {
        throw new OAuthError(
          "invalid_client",
          "client_id må peke på en offentlig HTTPS-adresse.",
          400
        )
      }
      return
    }

    let addresses: string[]
    try {
      addresses = await this.resolveHost(hostname)
    } catch {
      throw new OAuthError(
        "invalid_client",
        "Kunne ikke slå opp verten for client_id.",
        400
      )
    }

    if (
      addresses.length === 0 ||
      addresses.some((address) => isPrivateIpAddress(address))
    ) {
      throw new OAuthError(
        "invalid_client",
        "client_id må peke på en offentlig HTTPS-adresse.",
        400
      )
    }
  }

  private async fetchClientMetadataDocument(clientId: string) {
    const url = new URL(clientId)

    if (url.port && url.port !== "443") {
      throw new OAuthError(
        "invalid_client",
        "client_id må bruke standard HTTPS-port.",
        400
      )
    }

    // Note: this is a DNS check before the fetch, so a rebinding attacker with
    // a very short TTL is not fully excluded. It blocks the realistic case of a
    // client_id that simply points at an internal name.
    await this.assertPublicHost(url)

    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      // A redirect could leave the vetted host, so it is an error rather than
      // something to follow and re-validate.
      redirect: "error",
      signal: AbortSignal.timeout(CLIENT_METADATA_FETCH_TIMEOUT_MS),
    }).catch(() => null)

    if (!response || !response.ok) {
      throw new OAuthError(
        "invalid_client",
        "Klientens metadatadokument kunne ikke hentes.",
        400
      )
    }

    // Read incrementally and stop at the limit. The route is reachable without
    // a session, so buffering a hostile multi-gigabyte (or highly compressed)
    // body before checking its size would let anyone exhaust memory.
    const body = await readBodyWithinLimit(response, MAX_CLIENT_METADATA_BYTES)
    if (body === null) {
      throw new OAuthError(
        "invalid_client",
        "Klientens metadatadokument er for stort.",
        400
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      throw new OAuthError(
        "invalid_client",
        "Klientens metadatadokument er ikke gyldig JSON.",
        400
      )
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as Record<string, unknown>).client_id !== clientId
    ) {
      throw new OAuthError(
        "invalid_client",
        "client_id i metadatadokumentet må være identisk med URL-en.",
        400
      )
    }

    const validation = validateClientMetadata(parsed)
    if (!validation.ok) {
      throw new OAuthError(
        "invalid_client",
        `Ugyldig klientmetadata: ${validation.rejection.message}`,
        400
      )
    }

    return {
      metadata: validation.metadata,
      cacheUntil: this.cacheDeadline(response),
    }
  }

  private cacheDeadline(response: Response) {
    const cacheControl = response.headers.get("cache-control") ?? ""
    const maxAge = cacheControl.match(/max-age=(\d+)/)?.[1]
    const noStore = /no-store|no-cache/.test(cacheControl)

    const ttlMs = noStore
      ? CLIENT_METADATA_CACHE_TTL_MS
      : Math.min(
          Math.max(
            maxAge ? Number(maxAge) * 1000 : CLIENT_METADATA_CACHE_TTL_MS,
            60_000
          ),
          CLIENT_METADATA_MAX_CACHE_TTL_MS
        )

    return new Date(this.now().getTime() + ttlMs)
  }

  /**
   * RFC 7591 registration. Kept as a documented fallback for clients that do
   * not support Client ID Metadata Documents (see ADR 0002).
   */
  async registerDynamicClient(metadata: ClientMetadata) {
    const activeClients = await this.prisma.mcpOAuthClient.count({
      where: { status: "ACTIVE", registrationSource: "DYNAMIC" },
    })

    if (activeClients >= MAX_ACTIVE_DYNAMIC_CLIENTS) {
      throw new OAuthError(
        "invalid_client_metadata",
        "Serveren har nådd grensen for registrerte klienter. Fjern en ubrukt klient først.",
        400
      )
    }

    const issuedAt = this.now()

    return this.prisma.mcpOAuthClient.create({
      data: {
        // Deliberately not URL-shaped, so a dynamic id can never be mistaken
        // for a Client ID Metadata Document and fetched.
        id: `mcp-dcr-${randomBytes(24).toString("base64url")}`,
        name: metadata.clientName,
        redirectUris: metadata.redirectUris,
        grantTypes: metadata.grantTypes,
        responseTypes: metadata.responseTypes,
        registrationSource: "DYNAMIC",
        expiresAt: new Date(issuedAt.getTime() + DYNAMIC_REGISTRATION_TTL_MS),
      },
    })
  }

  /**
   * Marks the client as taken into use. For a dynamic registration this also
   * clears the "never used" deadline, so the registration stops being a
   * cleanup candidate.
   */
  async markClientUsed(clientId: string) {
    await this.prisma.mcpOAuthClient.updateMany({
      where: { id: clientId, registrationSource: "DYNAMIC" },
      data: { lastUsedAt: this.now(), expiresAt: null },
    })
    await this.prisma.mcpOAuthClient.updateMany({
      where: { id: clientId, registrationSource: { not: "DYNAMIC" } },
      data: { lastUsedAt: this.now() },
    })
  }
}

export const clientRegistry = new McpOAuthClientRegistry()

/**
 * Returns the body as text, or null as soon as more than `maxBytes` (decoded)
 * have arrived, cancelling the rest of the stream. A declared
 * `content-length` over the limit is refused without reading anything.
 */
export async function readBodyWithinLimit(
  response: Response,
  maxBytes: number
): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    return null
  }

  if (!response.body) {
    return ""
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }

  return new TextDecoder().decode(Buffer.concat(chunks))
}
