import type {
  McpOAuthAuthorizationCode,
  McpOAuthAuthorizationRequest,
  McpOAuthRefreshToken,
  PrismaClient,
} from "@workspace/db"

import {
  generateOpaqueToken,
  generateTokenFamilyId,
  hashOpaqueToken,
} from "./token-hash"

type TokenRepositoryOptions = {
  hashSecret: string
  now?: () => Date
  generateToken?: () => string
  generateFamilyId?: () => string
}

export type CreateAuthorizationRequestInput = {
  clientId: string
  userId?: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: string
  requestedScopes: string[]
  resource: string
  state?: string
  expiresAt: Date
}

export type IssueAuthorizationCodeInput = {
  clientId: string
  userId: string
  redirectUri: string
  scopes: string[]
  resource: string
  codeChallenge: string
  codeChallengeMethod: string
  expiresAt: Date
}

export type RotateRefreshTokenResult =
  | {
      status: "rotated"
      token: string
      refreshToken: McpOAuthRefreshToken
    }
  | {
      status: "reuse-detected"
      familyId: string
    }
  | {
      status: "invalid"
    }

export type OAuthCleanupResult = {
  authorizationRequests: number
  authorizationCodes: number
  refreshTokens: number
  unusedClients: number
}

export class McpOAuthTokenRepository {
  private readonly now: () => Date
  private readonly generateToken: () => string
  private readonly generateFamilyId: () => string

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: TokenRepositoryOptions
  ) {
    this.now = options.now ?? (() => new Date())
    this.generateToken = options.generateToken ?? generateOpaqueToken
    this.generateFamilyId = options.generateFamilyId ?? generateTokenFamilyId
  }

  private hash(token: string) {
    return hashOpaqueToken(token, this.options.hashSecret)
  }

  async createAuthorizationRequest(
    input: CreateAuthorizationRequestInput
  ): Promise<{
    token: string
    authorizationRequest: McpOAuthAuthorizationRequest
  }> {
    const token = this.generateToken()
    const authorizationRequest =
      await this.prisma.mcpOAuthAuthorizationRequest.create({
        data: {
          ...input,
          requestTokenHash: this.hash(token),
        },
      })

    return { token, authorizationRequest }
  }

  async issueAuthorizationCode(input: IssueAuthorizationCodeInput): Promise<{
    token: string
    authorizationCode: McpOAuthAuthorizationCode
  }> {
    const token = this.generateToken()
    const authorizationCode =
      await this.prisma.mcpOAuthAuthorizationCode.create({
        data: {
          ...input,
          codeHash: this.hash(token),
        },
      })

    return { token, authorizationCode }
  }

  async consumeAuthorizationCode(
    token: string
  ): Promise<McpOAuthAuthorizationCode | null> {
    const codeHash = this.hash(token)
    const consumedAt = this.now()

    return this.prisma.$transaction(async (transaction) => {
      const claim = await transaction.mcpOAuthAuthorizationCode.updateMany({
        where: {
          codeHash,
          consumedAt: null,
          expiresAt: { gt: consumedAt },
        },
        data: { consumedAt },
      })

      if (claim.count !== 1) {
        return null
      }

      return transaction.mcpOAuthAuthorizationCode.findUniqueOrThrow({
        where: { codeHash },
      })
    })
  }

  async issueRefreshToken(
    grantId: string,
    expiresAt: Date,
    familyId = this.generateFamilyId()
  ): Promise<{
    token: string
    refreshToken: McpOAuthRefreshToken
  } | null> {
    const token = this.generateToken()
    const tokenHash = this.hash(token)

    const refreshToken = await this.prisma.$transaction(async (transaction) => {
      const grant = await transaction.mcpOAuthGrant.findFirst({
        where: { id: grantId, revokedAt: null },
        select: { id: true },
      })

      if (!grant) {
        return null
      }

      return transaction.mcpOAuthRefreshToken.create({
        data: {
          tokenHash,
          grantId,
          familyId,
          expiresAt,
        },
      })
    })

    return refreshToken ? { token, refreshToken } : null
  }

  async rotateRefreshToken(
    token: string,
    replacementExpiresAt: Date
  ): Promise<RotateRefreshTokenResult> {
    const tokenHash = this.hash(token)
    const usedAt = this.now()
    const replacementToken = this.generateToken()
    const replacementHash = this.hash(replacementToken)

    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.mcpOAuthRefreshToken.findUnique({
        where: { tokenHash },
        include: {
          grant: {
            select: { revokedAt: true },
          },
        },
      })

      if (!current) {
        return { status: "invalid" } as const
      }

      if (current.consumedAt || current.replacedById) {
        await transaction.mcpOAuthRefreshToken.updateMany({
          where: {
            familyId: current.familyId,
            revokedAt: null,
          },
          data: { revokedAt: usedAt },
        })

        return {
          status: "reuse-detected",
          familyId: current.familyId,
        } as const
      }

      if (
        current.revokedAt ||
        current.expiresAt <= usedAt ||
        current.grant.revokedAt
      ) {
        return { status: "invalid" } as const
      }

      // Claim before creating the replacement. A concurrent request waits on
      // this row and then observes count=0, so it cannot create a second live
      // replacement.
      const claim = await transaction.mcpOAuthRefreshToken.updateMany({
        where: {
          id: current.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: usedAt },
        },
        data: {
          consumedAt: usedAt,
          lastUsedAt: usedAt,
        },
      })

      if (claim.count !== 1) {
        await transaction.mcpOAuthRefreshToken.updateMany({
          where: {
            familyId: current.familyId,
            revokedAt: null,
          },
          data: { revokedAt: usedAt },
        })

        return {
          status: "reuse-detected",
          familyId: current.familyId,
        } as const
      }

      const replacement = await transaction.mcpOAuthRefreshToken.create({
        data: {
          tokenHash: replacementHash,
          grantId: current.grantId,
          familyId: current.familyId,
          expiresAt: replacementExpiresAt,
        },
      })

      await transaction.mcpOAuthRefreshToken.update({
        where: { id: current.id },
        data: { replacedById: replacement.id },
      })

      return {
        status: "rotated",
        token: replacementToken,
        refreshToken: replacement,
      } as const
    })
  }

  async revokeGrant(grantId: string) {
    const revokedAt = this.now()

    return this.prisma.$transaction(async (transaction) => {
      const grant = await transaction.mcpOAuthGrant.updateMany({
        where: { id: grantId, revokedAt: null },
        data: { revokedAt },
      })
      const refreshTokens = await transaction.mcpOAuthRefreshToken.updateMany({
        where: { grantId, revokedAt: null },
        data: { revokedAt },
      })

      return {
        grantRevoked: grant.count === 1,
        refreshTokensRevoked: refreshTokens.count,
      }
    })
  }

  async cleanupExpiredRows(
    deleteFinalizedBefore: Date,
    now = this.now()
  ): Promise<OAuthCleanupResult> {
    return this.prisma.$transaction(async (transaction) => {
      const authorizationRequests =
        await transaction.mcpOAuthAuthorizationRequest.deleteMany({
          where: {
            OR: [
              { expiresAt: { lt: now } },
              { consumedAt: { lt: deleteFinalizedBefore } },
              { approvedAt: { lt: deleteFinalizedBefore } },
              { rejectedAt: { lt: deleteFinalizedBefore } },
            ],
          },
        })
      const authorizationCodes =
        await transaction.mcpOAuthAuthorizationCode.deleteMany({
          where: {
            OR: [
              { expiresAt: { lt: now } },
              { consumedAt: { lt: deleteFinalizedBefore } },
            ],
          },
        })
      const refreshTokens = await transaction.mcpOAuthRefreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { consumedAt: { lt: deleteFinalizedBefore } },
            { revokedAt: { lt: deleteFinalizedBefore } },
          ],
        },
      })
      const unusedClients = await transaction.mcpOAuthClient.deleteMany({
        where: {
          expiresAt: { lt: now },
          lastUsedAt: null,
          grants: { none: {} },
        },
      })

      return {
        authorizationRequests: authorizationRequests.count,
        authorizationCodes: authorizationCodes.count,
        refreshTokens: refreshTokens.count,
        unusedClients: unusedClients.count,
      }
    })
  }
}
