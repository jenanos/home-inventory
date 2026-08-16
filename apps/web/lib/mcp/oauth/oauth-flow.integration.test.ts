import { PrismaClient } from "@workspace/db"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { deriveCodeChallenge } from "./pkce"

// The configuration module is evaluated once at import time, so the environment
// has to be in place before any route handler is imported.
const ISSUER = "https://home.test"
const RESOURCE = `${ISSUER}/api/mcp`
const SIGNING_SECRET = "integration-flow-secret".padEnd(48, "-")

process.env.HOME_OVERVIEW_MCP_ISSUER = ISSUER
process.env.HOME_OVERVIEW_MCP_OAUTH_SIGNING_SECRET = SIGNING_SECRET
process.env.HOME_OVERVIEW_MCP_ACCESS_TOKEN_TTL_SECONDS = "900"
process.env.HOME_OVERVIEW_MCP_REFRESH_TOKEN_TTL_SECONDS = "2592000"

const currentSession: { userId: string | null; email: string } = {
  userId: null,
  email: "mcp-flow@example.test",
}

vi.mock("@/lib/auth", () => ({
  auth: async () =>
    currentSession.userId
      ? { user: { id: currentSession.userId, email: currentSession.email } }
      : null,
}))

const prisma = new PrismaClient()
const REDIRECT_URI = "http://127.0.0.1:8123/callback"
const CODE_VERIFIER = "z".repeat(64)
const CODE_CHALLENGE = deriveCodeChallenge(CODE_VERIFIER)

type Routes = {
  authorize: (request: Request) => Promise<Response>
  decision: (request: Request) => Promise<Response>
  token: (request: Request) => Promise<Response>
  register: (request: Request) => Promise<Response>
  revoke: (request: Request) => Promise<Response>
}

let routes: Routes
let resetRateLimits: () => void
let verifyAccessToken: typeof import("./access-token").verifyAccessToken
let deriveConsentCsrfToken: typeof import("./authorization").deriveConsentCsrfToken
let hashOpaqueToken: typeof import("./token-hash").hashOpaqueToken

const createdUserIds: string[] = []
const createdClientIds: string[] = []

async function createUser() {
  const user = await prisma.user.create({
    data: { email: `mcp-flow-${crypto.randomUUID()}@example.test` },
  })
  createdUserIds.push(user.id)
  return user
}

function formRequest(
  url: string,
  body: Record<string, string>,
  init: RequestInit = {}
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: new URLSearchParams(body).toString(),
  })
}

async function registerClient(name = "Integration client") {
  const response = await routes.register(
    new Request(`${ISSUER}/api/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: name,
        redirect_uris: [REDIRECT_URI],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    })
  )

  expect(response.status).toBe(201)
  const body = (await response.json()) as { client_id: string }
  createdClientIds.push(body.client_id)

  return body.client_id
}

function authorizeUrl(
  clientId: string,
  overrides: Record<string, string | null> = {}
) {
  const params: Record<string, string> = {
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: "S256",
    scope: "shopping:read shopping:write",
    state: "state-123",
    resource: RESOURCE,
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      delete params[key]
    } else {
      params[key] = value
    }
  }

  return `${ISSUER}/api/oauth/authorize?${new URLSearchParams(params).toString()}`
}

function consentTokenFrom(response: Response) {
  const cookie = response.headers.get("set-cookie") ?? ""
  return cookie.match(/mcp-oauth-consent=([^;]+)/)?.[1] ?? null
}

async function approveConsent(
  consentToken: string,
  scopes: string[],
  decision: "approve" | "deny" = "approve"
) {
  const csrf = deriveConsentCsrfToken(
    hashOpaqueToken(consentToken, SIGNING_SECRET),
    SIGNING_SECRET
  )
  const body = new URLSearchParams({ csrf, decision })
  for (const scope of scopes) {
    body.append("scope", scope)
  }

  return routes.decision(
    new Request(`${ISSUER}/api/oauth/authorize/decision`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `mcp-oauth-consent=${consentToken}`,
        origin: ISSUER,
      },
      body: body.toString(),
    })
  )
}

/** Walks the whole browser-side flow and returns the authorization code. */
async function obtainAuthorizationCode(
  clientId: string,
  scopes = ["shopping:read", "shopping:write"]
) {
  const authorizeResponse = await routes.authorize(
    new Request(authorizeUrl(clientId))
  )
  expect(authorizeResponse.status).toBe(302)

  const consentToken = consentTokenFrom(authorizeResponse)
  expect(consentToken).toBeTruthy()

  const decisionResponse = await approveConsent(consentToken as string, scopes)
  expect(decisionResponse.status).toBe(302)

  const location = new URL(decisionResponse.headers.get("location") as string)
  expect(location.searchParams.get("state")).toBe("state-123")
  expect(location.searchParams.get("iss")).toBe(ISSUER)

  return location.searchParams.get("code") as string
}

async function exchangeCode(
  clientId: string,
  code: string,
  overrides: Record<string, string> = {}
) {
  return routes.token(
    formRequest(`${ISSUER}/api/oauth/token`, {
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: CODE_VERIFIER,
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
      ...overrides,
    })
  )
}

beforeAll(async () => {
  await prisma.$connect()

  const [
    authorize,
    decision,
    token,
    register,
    revoke,
    rateLimit,
    accessToken,
    authorization,
    tokenHash,
  ] = await Promise.all([
    import("@/app/api/oauth/authorize/route"),
    import("@/app/api/oauth/authorize/decision/route"),
    import("@/app/api/oauth/token/route"),
    import("@/app/api/oauth/register/route"),
    import("@/app/api/oauth/revoke/route"),
    import("./rate-limit"),
    import("./access-token"),
    import("./authorization"),
    import("./token-hash"),
  ])

  routes = {
    authorize: authorize.GET,
    decision: decision.POST,
    token: token.POST,
    register: register.POST,
    revoke: revoke.POST,
  }
  resetRateLimits = rateLimit.resetRateLimitsForTesting
  verifyAccessToken = accessToken.verifyAccessToken
  deriveConsentCsrfToken = authorization.deriveConsentCsrfToken
  hashOpaqueToken = tokenHash.hashOpaqueToken
})

beforeEach(async () => {
  // The registration limit is 5/hour per address, and every test registers.
  resetRateLimits()
  currentSession.userId = (await createUser()).id
})

afterAll(async () => {
  await prisma.mcpOAuthClient.deleteMany({
    where: { id: { in: createdClientIds } },
  })
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
  await prisma.$disconnect()
})

describe("authorization code flow with PKCE", () => {
  it("registers, consents, exchanges a code and refreshes", async () => {
    const clientId = await registerClient()
    const code = await obtainAuthorizationCode(clientId)

    const tokenResponse = await exchangeCode(clientId, code)
    expect(tokenResponse.status).toBe(200)
    expect(tokenResponse.headers.get("cache-control")).toBe("no-store")

    const tokens = (await tokenResponse.json()) as {
      access_token: string
      refresh_token: string
      token_type: string
      expires_in: number
      scope: string
    }

    expect(tokens.token_type).toBe("Bearer")
    expect(tokens.expires_in).toBe(900)
    expect(tokens.scope).toBe("shopping:read shopping:write")

    const verified = verifyAccessToken({
      token: tokens.access_token,
      issuer: ISSUER,
      resource: RESOURCE,
      signingSecret: SIGNING_SECRET,
      clockSkewSeconds: 30,
    })

    expect(verified.ok).toBe(true)
    expect(verified.ok && verified.claims.sub).toBe(currentSession.userId)
    expect(verified.ok && verified.claims.client_id).toBe(clientId)

    const refreshResponse = await routes.token(
      formRequest(`${ISSUER}/api/oauth/token`, {
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: tokens.refresh_token,
      })
    )

    expect(refreshResponse.status).toBe(200)
    const refreshed = (await refreshResponse.json()) as {
      refresh_token: string
      access_token: string
    }
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token)

    // Reusing the rotated token is a leak signal and takes down the family.
    const reuseResponse = await routes.token(
      formRequest(`${ISSUER}/api/oauth/token`, {
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: tokens.refresh_token,
      })
    )
    expect(reuseResponse.status).toBe(400)
    expect((await reuseResponse.json()).error).toBe("invalid_grant")

    const afterFamilyRevocation = await routes.token(
      formRequest(`${ISSUER}/api/oauth/token`, {
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshed.refresh_token,
      })
    )
    expect(afterFamilyRevocation.status).toBe(400)
  })

  it("stores no token value in clear text", async () => {
    const clientId = await registerClient()
    const code = await obtainAuthorizationCode(clientId)
    const tokens = (await (await exchangeCode(clientId, code)).json()) as {
      refresh_token: string
    }

    const storedCodes = await prisma.mcpOAuthAuthorizationCode.findMany({
      where: { clientId },
    })
    const storedRefresh = await prisma.mcpOAuthRefreshToken.findMany({
      where: { grant: { clientId } },
    })

    expect(storedCodes).toHaveLength(1)
    expect(storedCodes[0]?.codeHash).not.toBe(code)
    expect(storedCodes[0]?.codeHash).toMatch(/^[0-9a-f]{64}$/)
    expect(storedRefresh[0]?.tokenHash).not.toBe(tokens.refresh_token)
    expect(storedRefresh[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("grants only the scopes the user actually ticked", async () => {
    const clientId = await registerClient()
    const code = await obtainAuthorizationCode(clientId, ["shopping:read"])
    const tokens = (await (await exchangeCode(clientId, code)).json()) as {
      scope: string
    }

    expect(tokens.scope).toBe("shopping:read")
  })

  it("treats an empty selection as a denial", async () => {
    const clientId = await registerClient()
    const authorizeResponse = await routes.authorize(
      new Request(authorizeUrl(clientId))
    )
    const consentToken = consentTokenFrom(authorizeResponse) as string

    const decisionResponse = await approveConsent(consentToken, [])
    const location = new URL(decisionResponse.headers.get("location") as string)

    expect(location.searchParams.get("error")).toBe("access_denied")
    expect(location.searchParams.get("state")).toBe("state-123")
  })

  it("redirects an explicit denial back to the client", async () => {
    const clientId = await registerClient()
    const authorizeResponse = await routes.authorize(
      new Request(authorizeUrl(clientId))
    )
    const consentToken = consentTokenFrom(authorizeResponse) as string

    const decisionResponse = await approveConsent(
      consentToken,
      ["shopping:read"],
      "deny"
    )
    const location = new URL(decisionResponse.headers.get("location") as string)

    expect(location.searchParams.get("error")).toBe("access_denied")
  })
})

describe("negative cases", () => {
  it("never redirects to an unregistered redirect URI", async () => {
    const clientId = await registerClient()
    const response = await routes.authorize(
      new Request(
        authorizeUrl(clientId, {
          redirect_uri: "https://evil.example/callback",
        })
      )
    )

    expect(response.status).toBe(400)
    expect(response.headers.get("location")).toBeNull()
  })

  it("rejects an unknown client without touching the database", async () => {
    const response = await routes.authorize(
      new Request(authorizeUrl("mcp-dcr-does-not-exist"))
    )

    expect(response.status).toBe(401)
    expect(response.headers.get("location")).toBeNull()
  })

  it("refuses a token minted for another resource", async () => {
    const clientId = await registerClient()
    const response = await routes.authorize(
      new Request(
        authorizeUrl(clientId, { resource: "https://evil.example/api/mcp" })
      )
    )

    const location = new URL(response.headers.get("location") as string)
    expect(location.origin + location.pathname).toBe(
      "http://127.0.0.1:8123/callback"
    )
    expect(location.searchParams.get("error")).toBe("invalid_request")
  })

  it("rejects a consent POST without the CSRF token", async () => {
    const clientId = await registerClient()
    const authorizeResponse = await routes.authorize(
      new Request(authorizeUrl(clientId))
    )
    const consentToken = consentTokenFrom(authorizeResponse) as string

    const response = await routes.decision(
      new Request(`${ISSUER}/api/oauth/authorize/decision`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: `mcp-oauth-consent=${consentToken}`,
          origin: ISSUER,
        },
        body: new URLSearchParams({
          decision: "approve",
          scope: "shopping:read",
        }).toString(),
      })
    )

    expect(response.status).toBe(403)
  })

  it("rejects a consent POST from another origin", async () => {
    const clientId = await registerClient()
    const authorizeResponse = await routes.authorize(
      new Request(authorizeUrl(clientId))
    )
    const consentToken = consentTokenFrom(authorizeResponse) as string
    const csrf = deriveConsentCsrfToken(
      hashOpaqueToken(consentToken, SIGNING_SECRET),
      SIGNING_SECRET
    )

    const response = await routes.decision(
      new Request(`${ISSUER}/api/oauth/authorize/decision`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: `mcp-oauth-consent=${consentToken}`,
          origin: "https://evil.example",
        },
        body: new URLSearchParams({
          csrf,
          decision: "approve",
          scope: "shopping:read",
        }).toString(),
      })
    )

    expect(response.status).toBe(403)
  })

  it("does not let another user approve a request that is not theirs", async () => {
    const clientId = await registerClient()
    const authorizeResponse = await routes.authorize(
      new Request(authorizeUrl(clientId))
    )
    const consentToken = consentTokenFrom(authorizeResponse) as string

    currentSession.userId = (await createUser()).id
    const response = await approveConsent(consentToken, ["shopping:read"])

    expect(response.status).toBe(400)
  })

  it("rejects a wrong PKCE verifier", async () => {
    const clientId = await registerClient()
    const code = await obtainAuthorizationCode(clientId)

    const response = await exchangeCode(clientId, code, {
      code_verifier: "q".repeat(64),
    })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("invalid_grant")
  })

  it("rejects a code presented by a different client", async () => {
    const clientId = await registerClient()
    const otherClientId = await registerClient("Other client")
    const code = await obtainAuthorizationCode(clientId)

    const response = await exchangeCode(otherClientId, code)

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("invalid_grant")
  })

  it("rejects a code when the client registration was revoked", async () => {
    const clientId = await registerClient()
    const code = await obtainAuthorizationCode(clientId)

    await prisma.mcpOAuthClient.update({
      where: { id: clientId },
      data: { status: "REVOKED", revokedAt: new Date() },
    })

    const response = await exchangeCode(clientId, code)

    expect(response.status).toBe(401)
    expect((await response.json()).error).toBe("invalid_client")
  })

  it("consumes a code exactly once and revokes the grant on replay", async () => {
    const clientId = await registerClient()
    const code = await obtainAuthorizationCode(clientId)

    expect((await exchangeCode(clientId, code)).status).toBe(200)

    const replay = await exchangeCode(clientId, code)
    expect(replay.status).toBe(400)

    const liveTokens = await prisma.mcpOAuthRefreshToken.count({
      where: { grant: { clientId }, revokedAt: null },
    })
    expect(liveTokens).toBe(0)
  })

  it("rejects a mismatched redirect URI at the token endpoint", async () => {
    const clientId = await registerClient()
    const code = await obtainAuthorizationCode(clientId)

    const response = await exchangeCode(clientId, code, {
      redirect_uri: "http://127.0.0.1:9999/callback",
    })

    expect(response.status).toBe(400)
  })

  it("rejects unsupported grant types and content types", async () => {
    const clientId = await registerClient()

    const unsupportedGrant = await routes.token(
      formRequest(`${ISSUER}/api/oauth/token`, {
        grant_type: "client_credentials",
        client_id: clientId,
      })
    )
    expect((await unsupportedGrant.json()).error).toBe("unsupported_grant_type")

    const wrongContentType = await routes.token(
      new Request(`${ISSUER}/api/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    )
    expect(wrongContentType.status).toBe(415)
  })

  it("rate-limits dynamic client registration", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await registerClient(`Rate limited ${attempt}`)
    }

    const response = await routes.register(
      new Request(`${ISSUER}/api/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "One too many",
          redirect_uris: [REDIRECT_URI],
        }),
      })
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBeTruthy()
  })

  it("rejects registration metadata that breaks the redirect rules", async () => {
    const response = await routes.register(
      new Request(`${ISSUER}/api/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Bad client",
          redirect_uris: ["http://localhost:8080/callback"],
        }),
      })
    )

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("invalid_client_metadata")
  })
})

describe("revocation", () => {
  it("stops refresh through the RFC 7009 endpoint", async () => {
    const clientId = await registerClient()
    const code = await obtainAuthorizationCode(clientId)
    const tokens = (await (await exchangeCode(clientId, code)).json()) as {
      refresh_token: string
    }

    const revokeResponse = await routes.revoke(
      formRequest(`${ISSUER}/api/oauth/revoke`, {
        token: tokens.refresh_token,
        token_type_hint: "refresh_token",
      })
    )
    expect(revokeResponse.status).toBe(200)

    const refreshAfterRevoke = await routes.token(
      formRequest(`${ISSUER}/api/oauth/token`, {
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: tokens.refresh_token,
      })
    )
    expect(refreshAfterRevoke.status).toBe(400)
  })

  it("answers 200 for an unknown token so it cannot be probed", async () => {
    const response = await routes.revoke(
      formRequest(`${ISSUER}/api/oauth/revoke`, { token: "not-a-real-token" })
    )

    expect(response.status).toBe(200)
  })

  it("stops refresh when the client registration is revoked", async () => {
    const clientId = await registerClient()
    const code = await obtainAuthorizationCode(clientId)
    const tokens = (await (await exchangeCode(clientId, code)).json()) as {
      refresh_token: string
    }

    await prisma.mcpOAuthClient.update({
      where: { id: clientId },
      data: { status: "REVOKED", revokedAt: new Date() },
    })

    const response = await routes.token(
      formRequest(`${ISSUER}/api/oauth/token`, {
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: tokens.refresh_token,
      })
    )

    expect(response.status).toBe(401)
    expect((await response.json()).error).toBe("invalid_client")
  })

  it("stops refresh when the user revokes the grant from settings", async () => {
    const clientId = await registerClient()
    const code = await obtainAuthorizationCode(clientId)
    const tokens = (await (await exchangeCode(clientId, code)).json()) as {
      refresh_token: string
    }

    const { createOAuthTokenRepository } = await import("./repository")
    const { mcpConfig } = await import("../config")
    if (!mcpConfig.enabled) {
      throw new Error("MCP config must be enabled for this test")
    }

    const repository = createOAuthTokenRepository(mcpConfig)
    const grants = await repository.listUserGrants(
      currentSession.userId as string
    )
    expect(grants).toHaveLength(1)

    // Another user must not be able to revoke it by guessing the id.
    const otherUser = await createUser()
    const foreignAttempt = await repository.revokeUserGrant(
      otherUser.id,
      grants[0]?.id as string
    )
    expect(foreignAttempt.grantRevoked).toBe(false)

    const revoked = await repository.revokeUserGrant(
      currentSession.userId as string,
      grants[0]?.id as string
    )
    expect(revoked.grantRevoked).toBe(true)

    const refreshAfterRevoke = await routes.token(
      formRequest(`${ISSUER}/api/oauth/token`, {
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: tokens.refresh_token,
      })
    )
    expect(refreshAfterRevoke.status).toBe(400)

    expect(
      await repository.listUserGrants(currentSession.userId as string)
    ).toHaveLength(0)
  })
})

describe("client registration survives a restart", () => {
  it("keeps client, grant and refresh capability in the database", async () => {
    const clientId = await registerClient()
    const code = await obtainAuthorizationCode(clientId)
    const tokens = (await (await exchangeCode(clientId, code)).json()) as {
      refresh_token: string
    }

    // A restart loses only in-process state; everything below is persisted.
    resetRateLimits()

    const client = await prisma.mcpOAuthClient.findUnique({
      where: { id: clientId },
    })
    expect(client?.lastUsedAt).toBeTruthy()
    expect(client?.expiresAt).toBeNull()

    const refreshResponse = await routes.token(
      formRequest(`${ISSUER}/api/oauth/token`, {
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: tokens.refresh_token,
      })
    )

    expect(refreshResponse.status).toBe(200)
  })
})
