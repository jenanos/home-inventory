BEGIN;

-- A user can currently belong to exactly one household. Stop before changing
-- the schema if historical data violates that product invariant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "HouseholdMember"
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one household per user: duplicate HouseholdMember.userId values exist';
  END IF;
END
$$;

-- CreateEnum
CREATE TYPE "McpOAuthClientRegistrationSource" AS ENUM (
    'CLIENT_ID_METADATA',
    'DYNAMIC',
    'ADMIN'
);

-- CreateEnum
CREATE TYPE "McpOAuthClientStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "McpOAuthClient" (
    "id" VARCHAR(512) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "redirectUris" TEXT[],
    "grantTypes" TEXT[],
    "responseTypes" TEXT[],
    "clientSecretHash" CHAR(64),
    "registrationSource" "McpOAuthClientRegistrationSource" NOT NULL,
    "status" "McpOAuthClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpOAuthAuthorizationRequest" (
    "id" UUID NOT NULL,
    "requestTokenHash" CHAR(64) NOT NULL,
    "clientId" VARCHAR(512) NOT NULL,
    "userId" UUID,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" VARCHAR(128) NOT NULL,
    "codeChallengeMethod" VARCHAR(16) NOT NULL,
    "requestedScopes" TEXT[],
    "resource" TEXT NOT NULL,
    "state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),

    CONSTRAINT "McpOAuthAuthorizationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpOAuthAuthorizationCode" (
    "id" UUID NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "clientId" VARCHAR(512) NOT NULL,
    "userId" UUID NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scopes" TEXT[],
    "resource" TEXT NOT NULL,
    "codeChallenge" VARCHAR(128) NOT NULL,
    "codeChallengeMethod" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "McpOAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpOAuthGrant" (
    "id" UUID NOT NULL,
    "clientId" VARCHAR(512) NOT NULL,
    "userId" UUID NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "McpOAuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpOAuthRefreshToken" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "grantId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "replacedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "McpOAuthRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_userId_key"
ON "HouseholdMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthClient_clientSecretHash_key"
ON "McpOAuthClient"("clientSecretHash");

-- CreateIndex
CREATE INDEX "McpOAuthClient_expiresAt_idx"
ON "McpOAuthClient"("expiresAt");

-- CreateIndex
CREATE INDEX "McpOAuthClient_status_revokedAt_idx"
ON "McpOAuthClient"("status", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthAuthorizationRequest_requestTokenHash_key"
ON "McpOAuthAuthorizationRequest"("requestTokenHash");

-- CreateIndex
CREATE INDEX "McpOAuthAuthorizationRequest_clientId_expiresAt_idx"
ON "McpOAuthAuthorizationRequest"("clientId", "expiresAt");

-- CreateIndex
CREATE INDEX "McpOAuthAuthorizationRequest_userId_expiresAt_idx"
ON "McpOAuthAuthorizationRequest"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "McpOAuthAuthorizationRequest_expiresAt_idx"
ON "McpOAuthAuthorizationRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthAuthorizationCode_codeHash_key"
ON "McpOAuthAuthorizationCode"("codeHash");

-- CreateIndex
CREATE INDEX "McpOAuthAuthorizationCode_clientId_expiresAt_idx"
ON "McpOAuthAuthorizationCode"("clientId", "expiresAt");

-- CreateIndex
CREATE INDEX "McpOAuthAuthorizationCode_userId_expiresAt_idx"
ON "McpOAuthAuthorizationCode"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "McpOAuthAuthorizationCode_expiresAt_idx"
ON "McpOAuthAuthorizationCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthGrant_userId_clientId_key"
ON "McpOAuthGrant"("userId", "clientId");

-- CreateIndex
CREATE INDEX "McpOAuthGrant_userId_revokedAt_idx"
ON "McpOAuthGrant"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "McpOAuthGrant_clientId_revokedAt_idx"
ON "McpOAuthGrant"("clientId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthRefreshToken_tokenHash_key"
ON "McpOAuthRefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthRefreshToken_replacedById_key"
ON "McpOAuthRefreshToken"("replacedById");

-- CreateIndex
CREATE INDEX "McpOAuthRefreshToken_grantId_revokedAt_idx"
ON "McpOAuthRefreshToken"("grantId", "revokedAt");

-- CreateIndex
CREATE INDEX "McpOAuthRefreshToken_familyId_revokedAt_idx"
ON "McpOAuthRefreshToken"("familyId", "revokedAt");

-- CreateIndex
CREATE INDEX "McpOAuthRefreshToken_expiresAt_idx"
ON "McpOAuthRefreshToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "McpOAuthAuthorizationRequest"
ADD CONSTRAINT "McpOAuthAuthorizationRequest_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthAuthorizationRequest"
ADD CONSTRAINT "McpOAuthAuthorizationRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthAuthorizationCode"
ADD CONSTRAINT "McpOAuthAuthorizationCode_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthAuthorizationCode"
ADD CONSTRAINT "McpOAuthAuthorizationCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthGrant"
ADD CONSTRAINT "McpOAuthGrant_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthGrant"
ADD CONSTRAINT "McpOAuthGrant_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthRefreshToken"
ADD CONSTRAINT "McpOAuthRefreshToken_grantId_fkey"
FOREIGN KEY ("grantId") REFERENCES "McpOAuthGrant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthRefreshToken"
ADD CONSTRAINT "McpOAuthRefreshToken_replacedById_fkey"
FOREIGN KEY ("replacedById") REFERENCES "McpOAuthRefreshToken"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
