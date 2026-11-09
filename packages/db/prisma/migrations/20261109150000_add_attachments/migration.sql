-- Uploaded images and documents for plants, beds and projects, stored in the
-- database (ADR 0010). AttachmentContent holds the bytes, so a listing never
-- reads them.

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "AttachmentSource" AS ENUM ('UPLOAD', 'UPLOAD_LINK', 'MCP_FILE', 'URL');

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "plantId" UUID,
    "bedId" UUID,
    "projectId" UUID,
    "kind" "AttachmentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" "AttachmentSource" NOT NULL DEFAULT 'UPLOAD',
    "sourceUrl" TEXT,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttachmentContent" (
    "attachmentId" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "thumbnail" BYTEA,

    CONSTRAINT "AttachmentContent_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateIndex
CREATE INDEX "Attachment_householdId_idx" ON "Attachment"("householdId");

-- CreateIndex
CREATE INDEX "Attachment_plantId_sortOrder_idx" ON "Attachment"("plantId", "sortOrder");

-- CreateIndex
CREATE INDEX "Attachment_bedId_sortOrder_idx" ON "Attachment"("bedId", "sortOrder");

-- CreateIndex
CREATE INDEX "Attachment_projectId_sortOrder_idx" ON "Attachment"("projectId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "GardenBed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentContent" ADD CONSTRAINT "AttachmentContent_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Exactly one owner per attachment.
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_one_owner_check"
  CHECK (num_nonnulls("plantId", "bedId", "projectId") = 1);

-- The bytes are already compressed (JPEG, WebP, PDF); TOAST compression would
-- only cost CPU.
ALTER TABLE "AttachmentContent" ALTER COLUMN "data" SET STORAGE EXTERNAL;
ALTER TABLE "AttachmentContent" ALTER COLUMN "thumbnail" SET STORAGE EXTERNAL;
