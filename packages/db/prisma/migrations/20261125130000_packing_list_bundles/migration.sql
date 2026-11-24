-- Which bundles are on a list, and for whom, kept apart from the items so a
-- template keeps following a bundle that is empty for a while (ADR 0017).

-- CreateTable
CREATE TABLE "PackingListBundle" (
    "id" UUID NOT NULL,
    "listId" UUID NOT NULL,
    "bundleId" UUID NOT NULL,
    "personId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackingListBundle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackingListBundle_listId_idx" ON "PackingListBundle"("listId");

-- CreateIndex
CREATE INDEX "PackingListBundle_bundleId_idx" ON "PackingListBundle"("bundleId");

-- CreateIndex
CREATE INDEX "PackingListBundle_personId_idx" ON "PackingListBundle"("personId");

-- AddForeignKey
ALTER TABLE "PackingListBundle" ADD CONSTRAINT "PackingListBundle_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingListBundle" ADD CONSTRAINT "PackingListBundle_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "PackingBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingListBundle" ADD CONSTRAINT "PackingListBundle_personId_fkey" FOREIGN KEY ("personId") REFERENCES "PackingPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lists from before: one row per bundle and person that has things on them.
INSERT INTO "PackingListBundle" ("id", "listId", "bundleId", "personId")
SELECT gen_random_uuid(), placed."listId", placed."bundleId", placed."personId"
FROM (
  SELECT DISTINCT "listId", "bundleId", "personId"
  FROM "PackingItem"
  WHERE "bundleId" IS NOT NULL
) AS placed;
