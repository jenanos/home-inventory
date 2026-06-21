-- CreateEnum
CREATE TYPE "WateringNeed" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "WateringMethod" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "SunNeed" AS ENUM ('FULL_SUN', 'PARTIAL_SHADE', 'SHADE');

-- CreateEnum
CREATE TYPE "PlantType" AS ENUM ('TREE', 'SHRUB', 'PERENNIAL', 'ANNUAL', 'FLOWER', 'HERB', 'VEGETABLE', 'CLIMBER', 'GRASS', 'OTHER');

-- CreateEnum
CREATE TYPE "Lifecycle" AS ENUM ('ANNUAL', 'BIENNIAL', 'PERENNIAL');

-- CreateTable
CREATE TABLE "Plant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "species" TEXT,
    "location" TEXT,
    "description" TEXT,
    "careInstructions" TEXT,
    "wateringNeed" "WateringNeed",
    "wateringMethod" "WateringMethod",
    "lastWateredAt" TIMESTAMP(3),
    "sunNeed" "SunNeed",
    "lastPrunedAt" TIMESTAMP(3),
    "pruningSeason" TEXT,
    "isToxic" BOOLEAN NOT NULL DEFAULT false,
    "toxicityNotes" TEXT,
    "plantType" "PlantType",
    "soilType" TEXT,
    "fertilizer" TEXT,
    "hardinessZone" TEXT,
    "lifecycle" "Lifecycle",
    "bloomTime" TEXT,
    "plantedAt" TIMESTAMP(3),
    "pests" TEXT,
    "notes" TEXT,
    "imageUrl" TEXT,
    "householdId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Plant_householdId_idx" ON "Plant"("householdId");

-- AddForeignKey
ALTER TABLE "Plant" ADD CONSTRAINT "Plant_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
