-- Packing lists: kinds, sub-lists, a bundle's own person and quantities by
-- trip length (ADR 0017).

-- ─── List kinds ─────────────────────────────────────────────────

CREATE TYPE "PackingListKind" AS ENUM ('TEMPLATE', 'TRIP', 'ARCHIVED');

ALTER TABLE "PackingList" ADD COLUMN "kind" "PackingListKind" NOT NULL DEFAULT 'TRIP';

DROP INDEX "PackingList_householdId_idx";
CREATE INDEX "PackingList_householdId_kind_idx" ON "PackingList"("householdId", "kind");

-- Lists named with a prefix before kinds existed: "Mal: Hytta", "[Mal] Hytta",
-- "Mal – Hytta" or "Hytta (mal)" become templates, and "Historikk: …" or
-- "Arkiv: …" finished trips. The prefix is taken out of the name. A word that
-- only starts with "mal" ("Malaga") has no separator and is left alone.
UPDATE "PackingList"
SET "kind" = 'TEMPLATE',
    "name" = btrim(regexp_replace(
      regexp_replace("name", '^\s*[\[(]?\s*mal\s*[\])]?\s*[:\-–—|]\s*', '', 'i'),
      '\s*[\[(]\s*mal\s*[\])]\s*$', '', 'i'))
WHERE ("name" ~* '^\s*[\[(]?\s*mal\s*[\])]?\s*[:\-–—|]\s*\S'
    OR "name" ~* '^\s*[\[(]\s*mal\s*[\])]\s*\S'
    OR "name" ~* '\S\s*[\[(]\s*mal\s*[\])]\s*$');

UPDATE "PackingList"
SET "name" = btrim(regexp_replace("name", '^\s*[\[(]\s*mal\s*[\])]\s*', '', 'i'))
WHERE "kind" = 'TEMPLATE' AND "name" ~* '^\s*[\[(]\s*mal\s*[\])]\s*\S';

UPDATE "PackingList"
SET "kind" = 'ARCHIVED',
    "name" = btrim(regexp_replace("name", '^\s*[\[(]?\s*(historikk|arkiv|arkivert)\s*[\])]?\s*[:\-–—|]?\s*', '', 'i'))
WHERE "kind" = 'TRIP'
  AND "name" ~* '^\s*[\[(]?\s*(historikk|arkiv|arkivert)\s*[\])]?\s*([:\-–—|]\s*|\s+)\S';

-- ─── Sub-lists ──────────────────────────────────────────────────

CREATE TABLE "PackingListGroup" (
    "id" UUID NOT NULL,
    "listId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingListGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PackingListGroup_listId_sortOrder_idx" ON "PackingListGroup"("listId", "sortOrder");

ALTER TABLE "PackingListGroup" ADD CONSTRAINT "PackingListGroup_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PackingItem" ADD COLUMN "groupId" UUID;

CREATE INDEX "PackingItem_groupId_idx" ON "PackingItem"("groupId");

ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PackingListGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Bundles: own person and quantities by trip length ──────────

ALTER TABLE "PackingBundle" ADD COLUMN "personId" UUID;

ALTER TABLE "PackingBundle" ADD CONSTRAINT "PackingBundle_personId_fkey" FOREIGN KEY ("personId") REFERENCES "PackingPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PackingBundleItem"
ADD COLUMN "quantityDay" INTEGER,
ADD COLUMN "quantityWeekend" INTEGER,
ADD COLUMN "quantityWeek" INTEGER,
ADD COLUMN "quantityLong" INTEGER;

-- ─── Items remember the bundle item they came from ──────────────

ALTER TABLE "PackingItem" ADD COLUMN "bundleItemId" UUID;

CREATE INDEX "PackingItem_bundleItemId_idx" ON "PackingItem"("bundleItemId");

ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_bundleItemId_fkey" FOREIGN KEY ("bundleItemId") REFERENCES "PackingBundleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Items copied in before this migration: link them to the bundle item with
-- the same name (case and spacing ignored, as packingItemKey does).
UPDATE "PackingItem" AS item
SET "bundleItemId" = bundle_item."id"
FROM "PackingBundleItem" AS bundle_item
WHERE item."bundleId" = bundle_item."bundleId"
  AND item."bundleItemId" IS NULL
  AND lower(regexp_replace(btrim(item."name"), '\s+', ' ', 'g'))
    = lower(regexp_replace(btrim(bundle_item."name"), '\s+', ' ', 'g'));
