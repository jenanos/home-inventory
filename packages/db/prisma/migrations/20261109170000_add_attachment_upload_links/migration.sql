-- Short-lived upload links for attachments (ADR 0011).



-- CreateTable
CREATE TABLE "AttachmentUploadLink" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "householdId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "caption" TEXT,
    "maxFiles" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "clientId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttachmentUploadLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttachmentUploadLink_tokenHash_key" ON "AttachmentUploadLink"("tokenHash");

-- CreateIndex
CREATE INDEX "AttachmentUploadLink_expiresAt_idx" ON "AttachmentUploadLink"("expiresAt");

-- AddForeignKey
ALTER TABLE "AttachmentUploadLink" ADD CONSTRAINT "AttachmentUploadLink_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentUploadLink" ADD CONSTRAINT "AttachmentUploadLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

