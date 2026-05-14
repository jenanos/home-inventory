-- CreateTable
CREATE TABLE "BudgetEntryCategory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budgetId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetEntryCategory_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "BudgetEntry"
ADD COLUMN "categoryId" UUID;

-- Migrate existing fixed sections to editable categories
INSERT INTO "BudgetEntryCategory" ("budgetId", "name", "sortOrder", "updatedAt")
SELECT
    "budgetId",
    CASE
        WHEN "category" IN ('ELECTRICITY', 'MUNICIPAL_FEES', 'INSURANCE', 'HOME_MAINTENANCE') THEN 'Boligkostnader'
        ELSE 'Faste kostnader'
    END,
    CASE
        WHEN "category" IN ('ELECTRICITY', 'MUNICIPAL_FEES', 'INSURANCE', 'HOME_MAINTENANCE') THEN 0
        ELSE 1
    END,
    CURRENT_TIMESTAMP
FROM "BudgetEntry"
WHERE "category" IS NOT NULL
GROUP BY
    "budgetId",
    CASE
        WHEN "category" IN ('ELECTRICITY', 'MUNICIPAL_FEES', 'INSURANCE', 'HOME_MAINTENANCE') THEN 'Boligkostnader'
        ELSE 'Faste kostnader'
    END,
    CASE
        WHEN "category" IN ('ELECTRICITY', 'MUNICIPAL_FEES', 'INSURANCE', 'HOME_MAINTENANCE') THEN 0
        ELSE 1
    END;

UPDATE "BudgetEntry" AS entry
SET "categoryId" = category."id"
FROM "BudgetEntryCategory" AS category
WHERE entry."budgetId" = category."budgetId"
  AND entry."category" IS NOT NULL
  AND category."name" = CASE
      WHEN entry."category" IN ('ELECTRICITY', 'MUNICIPAL_FEES', 'INSURANCE', 'HOME_MAINTENANCE') THEN 'Boligkostnader'
      ELSE 'Faste kostnader'
  END;

ALTER TABLE "BudgetEntry"
DROP COLUMN "category";

-- DropEnum
DROP TYPE "BudgetCategory";

-- CreateIndex
CREATE UNIQUE INDEX "BudgetEntryCategory_budgetId_name_key" ON "BudgetEntryCategory"("budgetId", "name");

-- CreateIndex
CREATE INDEX "BudgetEntryCategory_budgetId_sortOrder_idx" ON "BudgetEntryCategory"("budgetId", "sortOrder");

-- CreateIndex
CREATE INDEX "BudgetEntry_categoryId_idx" ON "BudgetEntry"("categoryId");

-- AddForeignKey
ALTER TABLE "BudgetEntryCategory" ADD CONSTRAINT "BudgetEntryCategory_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetEntry" ADD CONSTRAINT "BudgetEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BudgetEntryCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
