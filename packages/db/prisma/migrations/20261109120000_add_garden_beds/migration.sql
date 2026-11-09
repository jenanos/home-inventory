-- A plant used to have one free-text `location`. The same plant growing in two
-- beds therefore had to be stored twice. Beds become their own table, and a
-- plant gets one placement row per bed it grows in.
--
-- Data migration:
--   1. Every distinct, non-blank location becomes a bed in its household.
--   2. Plant rows that are identical in every field except `location` (and
--      their ids and timestamps) are merged into the oldest of them. The others
--      keep nothing the survivor lacks, so no data is lost.
--   3. Each original row's location becomes a placement on the surviving plant.
--   4. The duplicates and the `location` column are dropped.

-- CreateTable
CREATE TABLE "GardenBed" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sunExposure" "SunNeed",
    "notes" TEXT,
    "householdId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GardenBed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantPlacement" (
    "id" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "bedId" UUID NOT NULL,
    "quantity" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GardenBed_householdId_name_key" ON "GardenBed"("householdId", "name");

-- CreateIndex
CREATE INDEX "PlantPlacement_bedId_idx" ON "PlantPlacement"("bedId");

-- CreateIndex
CREATE UNIQUE INDEX "PlantPlacement_plantId_bedId_key" ON "PlantPlacement"("plantId", "bedId");

-- AddForeignKey
ALTER TABLE "GardenBed" ADD CONSTRAINT "GardenBed_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantPlacement" ADD CONSTRAINT "PlantPlacement_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantPlacement" ADD CONSTRAINT "PlantPlacement_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "GardenBed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 1. Beds from the existing locations.
INSERT INTO "GardenBed" ("id", "name", "householdId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), loc."name", loc."householdId", loc."createdAt", CURRENT_TIMESTAMP
FROM (
    SELECT btrim("location") AS "name", "householdId", MIN("createdAt") AS "createdAt"
    FROM "Plant"
    WHERE "location" IS NOT NULL AND btrim("location") <> ''
    GROUP BY btrim("location"), "householdId"
) AS loc;

-- 2. Map every plant row to the oldest identical row. PARTITION BY treats NULLs
-- as equal, which is what "identical" means here.
CREATE TEMPORARY TABLE "_plant_survivor" AS
SELECT
    "id",
    first_value("id") OVER (
        PARTITION BY
            "householdId", "name", "species", "description", "careInstructions",
            "wateringNeed", "wateringMethod", "lastWateredAt", "sunNeed",
            "lastPrunedAt", "pruningSeason", "isToxic", "toxicityNotes",
            "plantType", "soilType", "fertilizer", "hardinessZone", "lifecycle",
            "bloomTime", "plantedAt", "pests", "notes", "imageUrl", "sourceUrl"
        ORDER BY "createdAt", "id"
    ) AS "survivorId",
    btrim("location") AS "location",
    "householdId",
    "createdAt"
FROM "Plant";

-- 3. One placement per original row, on the surviving plant.
INSERT INTO "PlantPlacement" ("id", "plantId", "bedId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), s."survivorId", b."id", MIN(s."createdAt"), CURRENT_TIMESTAMP
FROM "_plant_survivor" s
JOIN "GardenBed" b ON b."householdId" = s."householdId" AND b."name" = s."location"
WHERE s."location" IS NOT NULL AND s."location" <> ''
GROUP BY s."survivorId", b."id";

-- 4. Drop the merged duplicates and the old column.
DELETE FROM "Plant" p
USING "_plant_survivor" s
WHERE p."id" = s."id" AND s."id" <> s."survivorId";

ALTER TABLE "Plant" DROP COLUMN "location";
DROP TABLE "_plant_survivor";
