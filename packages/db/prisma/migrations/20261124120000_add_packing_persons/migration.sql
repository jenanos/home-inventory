-- People things are packed for, who need not be users of the app (ADR 0016).
CREATE TABLE "PackingPerson" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingPerson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PackingPerson_householdId_name_key" ON "PackingPerson"("householdId", "name");

ALTER TABLE "PackingPerson" ADD CONSTRAINT "PackingPerson_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Who an item on a packing list is for. Deleting the person keeps the item.
ALTER TABLE "PackingItem" ADD COLUMN "personId" UUID;

CREATE INDEX "PackingItem_personId_idx" ON "PackingItem"("personId");

ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_personId_fkey" FOREIGN KEY ("personId") REFERENCES "PackingPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
