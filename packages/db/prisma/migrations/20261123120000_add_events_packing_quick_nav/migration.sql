-- Hendelser (ADR 0015), pakkelister (ADR 0016) and the phone's quick panel.

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('BIRTHDAY', 'ANNIVERSARY', 'HOLIDAY', 'OTHER');

-- CreateEnum
CREATE TYPE "CalendarEventRecurrence" AS ENUM ('YEARLY', 'NONE');

-- CreateEnum
CREATE TYPE "PackingSeason" AS ENUM ('SPRING', 'SUMMER', 'AUTUMN', 'WINTER');

-- CreateEnum
CREATE TYPE "PackingDuration" AS ENUM ('DAY', 'WEEKEND', 'WEEK', 'LONG');

-- AlterTable
ALTER TABLE "ShoppingList" ADD COLUMN     "eventId" UUID;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "quickNavPages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "CalendarEventType" NOT NULL DEFAULT 'BIRTHDAY',
    "recurrence" "CalendarEventRecurrence" NOT NULL DEFAULT 'YEARLY',
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "year" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingList" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "season" "PackingSeason",
    "duration" "PackingDuration",
    "abroad" BOOLEAN NOT NULL DEFAULT false,
    "departureOn" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingItem" (
    "id" UUID NOT NULL,
    "listId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "packed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "bundleId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingBundle" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "seasons" "PackingSeason"[] DEFAULT ARRAY[]::"PackingSeason"[],
    "durations" "PackingDuration"[] DEFAULT ARRAY[]::"PackingDuration"[],
    "abroadOnly" BOOLEAN NOT NULL DEFAULT false,
    "autoAdd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingBundleItem" (
    "id" UUID NOT NULL,
    "bundleId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEvent_householdId_month_day_idx" ON "CalendarEvent"("householdId", "month", "day");

-- CreateIndex
CREATE INDEX "PackingList_householdId_idx" ON "PackingList"("householdId");

-- CreateIndex
CREATE INDEX "PackingItem_listId_sortOrder_idx" ON "PackingItem"("listId", "sortOrder");

-- CreateIndex
CREATE INDEX "PackingItem_bundleId_idx" ON "PackingItem"("bundleId");

-- CreateIndex
CREATE UNIQUE INDEX "PackingBundle_householdId_name_key" ON "PackingBundle"("householdId", "name");

-- CreateIndex
CREATE INDEX "PackingBundleItem_bundleId_sortOrder_idx" ON "PackingBundleItem"("bundleId", "sortOrder");

-- CreateIndex
CREATE INDEX "ShoppingList_eventId_idx" ON "ShoppingList"("eventId");

-- AddForeignKey
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "PackingBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingBundle" ADD CONSTRAINT "PackingBundle_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingBundleItem" ADD CONSTRAINT "PackingBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "PackingBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Not expressible in Prisma: a date the write services also check.
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_date_check"
  CHECK ("month" BETWEEN 1 AND 12 AND "day" BETWEEN 1 AND 31);
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_one_off_year_check"
  CHECK ("recurrence" <> 'NONE' OR "year" IS NOT NULL);
ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_quantity_check" CHECK ("quantity" >= 1);
ALTER TABLE "PackingBundleItem" ADD CONSTRAINT "PackingBundleItem_quantity_check" CHECK ("quantity" >= 1);
