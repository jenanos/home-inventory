import { readFile } from "node:fs/promises"

import { PrismaClient } from "@workspace/db"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { hashOpaqueToken } from "./token-hash"
import { McpOAuthTokenRepository } from "./token-repository"

const prisma = new PrismaClient()
const HASH_SECRET = "integration-test-secret".padEnd(32, "-")
const NOW = new Date("2026-07-30T12:00:00.000Z")
const EXPIRES_AT = new Date("2026-07-30T13:00:00.000Z")
const RESOURCE = "https://home.jenanos.xyz/api/mcp"

const createdUserIds: string[] = []
const createdClientIds: string[] = []
let databaseConnected = false

function uniqueValue(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

async function createOAuthFixture() {
  const user = await prisma.user.create({
    data: {
      email: `${uniqueValue("mcp")}@example.test`,
    },
  })
  const client = await prisma.mcpOAuthClient.create({
    data: {
      id: `https://clients.example.test/${uniqueValue("client")}`,
      name: "Integration test client",
      redirectUris: ["https://client.example.test/callback"],
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      registrationSource: "CLIENT_ID_METADATA",
    },
  })
  const grant = await prisma.mcpOAuthGrant.create({
    data: {
      userId: user.id,
      clientId: client.id,
      scopes: ["shopping:read"],
    },
  })

  createdUserIds.push(user.id)
  createdClientIds.push(client.id)

  return { user, client, grant }
}

beforeAll(async () => {
  await prisma.$connect()
  databaseConnected = true
})

afterAll(async () => {
  if (!databaseConnected) {
    return
  }

  await prisma.mcpOAuthClient.deleteMany({
    where: { id: { in: createdClientIds } },
  })
  await prisma.user.deleteMany({
    where: { id: { in: createdUserIds } },
  })
  await prisma.$disconnect()
})

describe("McpOAuthTokenRepository", () => {
  it("stores only hashes and consumes an authorization code exactly once", async () => {
    const { user, client } = await createOAuthFixture()
    const repository = new McpOAuthTokenRepository(prisma, {
      hashSecret: HASH_SECRET,
      now: () => NOW,
    })
    const issued = await repository.issueAuthorizationCode({
      clientId: client.id,
      userId: user.id,
      redirectUri: client.redirectUris[0]!,
      scopes: ["shopping:read"],
      resource: RESOURCE,
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      expiresAt: EXPIRES_AT,
    })

    expect(issued.authorizationCode.codeHash).toBe(
      hashOpaqueToken(issued.token, HASH_SECRET)
    )
    expect(issued.authorizationCode.codeHash).not.toContain(issued.token)

    const results = await Promise.all([
      repository.consumeAuthorizationCode(issued.token),
      repository.consumeAuthorizationCode(issued.token),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
    expect(results.filter((result) => result === null)).toHaveLength(1)
  })

  it("allows one concurrent refresh rotation and revokes the family on reuse", async () => {
    const { grant } = await createOAuthFixture()
    const repository = new McpOAuthTokenRepository(prisma, {
      hashSecret: HASH_SECRET,
      now: () => NOW,
    })
    const issued = await repository.issueRefreshToken(grant.id, EXPIRES_AT)

    expect(issued).not.toBeNull()
    expect(issued!.refreshToken.tokenHash).toBe(
      hashOpaqueToken(issued!.token, HASH_SECRET)
    )

    const results = await Promise.all([
      repository.rotateRefreshToken(issued!.token, EXPIRES_AT),
      repository.rotateRefreshToken(issued!.token, EXPIRES_AT),
    ])

    expect(results.map((result) => result.status).sort()).toEqual([
      "reuse-detected",
      "rotated",
    ])

    const family = await prisma.mcpOAuthRefreshToken.findMany({
      where: { familyId: issued!.refreshToken.familyId },
    })
    expect(family).toHaveLength(2)
    expect(family.every((token) => token.revokedAt !== null)).toBe(true)
  })

  it("stops refresh after grant revocation", async () => {
    const { grant } = await createOAuthFixture()
    const repository = new McpOAuthTokenRepository(prisma, {
      hashSecret: HASH_SECRET,
      now: () => NOW,
    })
    const issued = await repository.issueRefreshToken(grant.id, EXPIRES_AT)

    expect(issued).not.toBeNull()
    await repository.revokeGrant(grant.id)

    await expect(
      repository.rotateRefreshToken(issued!.token, EXPIRES_AT)
    ).resolves.toEqual({ status: "invalid" })
  })

  it("cascades all OAuth state when a user is deleted", async () => {
    const { user, client, grant } = await createOAuthFixture()
    const repository = new McpOAuthTokenRepository(prisma, {
      hashSecret: HASH_SECRET,
      now: () => NOW,
    })
    await repository.createAuthorizationRequest({
      clientId: client.id,
      userId: user.id,
      redirectUri: client.redirectUris[0]!,
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      requestedScopes: ["shopping:read"],
      resource: RESOURCE,
      expiresAt: EXPIRES_AT,
    })
    await repository.issueAuthorizationCode({
      clientId: client.id,
      userId: user.id,
      redirectUri: client.redirectUris[0]!,
      scopes: ["shopping:read"],
      resource: RESOURCE,
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      expiresAt: EXPIRES_AT,
    })
    await repository.issueRefreshToken(grant.id, EXPIRES_AT)

    await prisma.user.delete({ where: { id: user.id } })

    await expect(
      Promise.all([
        prisma.mcpOAuthAuthorizationRequest.count({
          where: { userId: user.id },
        }),
        prisma.mcpOAuthAuthorizationCode.count({
          where: { userId: user.id },
        }),
        prisma.mcpOAuthGrant.count({ where: { userId: user.id } }),
        prisma.mcpOAuthRefreshToken.count({ where: { grantId: grant.id } }),
      ])
    ).resolves.toEqual([0, 0, 0, 0])
  })

  it("removes expired OAuth rows and unused expired clients", async () => {
    const { user, client, grant } = await createOAuthFixture()
    const expiredAt = new Date("2026-07-29T12:00:00.000Z")
    const repository = new McpOAuthTokenRepository(prisma, {
      hashSecret: HASH_SECRET,
      now: () => NOW,
    })
    const request = await repository.createAuthorizationRequest({
      clientId: client.id,
      userId: user.id,
      redirectUri: client.redirectUris[0]!,
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      requestedScopes: ["shopping:read"],
      resource: RESOURCE,
      expiresAt: expiredAt,
    })
    const code = await repository.issueAuthorizationCode({
      clientId: client.id,
      userId: user.id,
      redirectUri: client.redirectUris[0]!,
      scopes: ["shopping:read"],
      resource: RESOURCE,
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      expiresAt: expiredAt,
    })
    const refresh = await repository.issueRefreshToken(grant.id, expiredAt)
    const unusedClient = await prisma.mcpOAuthClient.create({
      data: {
        id: `https://clients.example.test/${uniqueValue("expired")}`,
        name: "Expired client",
        redirectUris: ["https://client.example.test/callback"],
        grantTypes: ["authorization_code"],
        responseTypes: ["code"],
        registrationSource: "CLIENT_ID_METADATA",
        expiresAt: expiredAt,
      },
    })
    createdClientIds.push(unusedClient.id)

    expect(request.authorizationRequest.requestTokenHash).not.toContain(
      request.token
    )
    expect(code.authorizationCode.codeHash).not.toContain(code.token)
    expect(refresh!.refreshToken.tokenHash).not.toContain(refresh!.token)

    await expect(
      repository.cleanupExpiredRows(expiredAt, NOW)
    ).resolves.toEqual({
      authorizationRequests: 1,
      authorizationCodes: 1,
      refreshTokens: 1,
      unusedClients: 1,
    })
  })
})

describe("household membership migration", () => {
  it("enforces one household membership per user", async () => {
    const user = await prisma.user.create({
      data: { email: `${uniqueValue("household")}@example.test` },
    })
    const firstHousehold = await prisma.household.create({
      data: { name: "First" },
    })
    const secondHousehold = await prisma.household.create({
      data: { name: "Second" },
    })
    createdUserIds.push(user.id)

    await prisma.householdMember.create({
      data: {
        userId: user.id,
        householdId: firstHousehold.id,
      },
    })

    await expect(
      prisma.householdMember.create({
        data: {
          userId: user.id,
          householdId: secondHousehold.id,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" })

    await prisma.household.deleteMany({
      where: { id: { in: [firstHousehold.id, secondHousehold.id] } },
    })
  })

  it("runs the migration guard against actual duplicate rows", async () => {
    const migrationUrl = new URL(
      "../../../../../packages/db/prisma/migrations/20260730120000_add_mcp_oauth_models/migration.sql",
      import.meta.url
    )
    const migration = await readFile(migrationUrl, "utf8")
    const duplicateGuard = migration.match(/DO \$\$[\s\S]*?\$\$;/)?.[0]

    expect(duplicateGuard).toBeDefined()

    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`
          CREATE TEMP TABLE "HouseholdMember" (
            "userId" UUID NOT NULL,
            "householdId" UUID NOT NULL
          ) ON COMMIT DROP
        `)
        const duplicateUserId = crypto.randomUUID()
        await transaction.$executeRawUnsafe(
          `INSERT INTO "HouseholdMember" ("userId", "householdId")
           VALUES ($1::uuid, $2::uuid), ($1::uuid, $3::uuid)`,
          duplicateUserId,
          crypto.randomUUID(),
          crypto.randomUUID()
        )
        await transaction.$executeRawUnsafe(duplicateGuard!)
      })
    ).rejects.toThrow(/duplicate HouseholdMember\.userId/)
  })
})
