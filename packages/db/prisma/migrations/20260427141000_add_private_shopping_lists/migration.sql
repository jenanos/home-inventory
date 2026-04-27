-- AlterTable
ALTER TABLE "ShoppingList"
ADD COLUMN "createdById" UUID,
ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ShoppingList_householdId_isPrivate_idx"
ON "ShoppingList"("householdId", "isPrivate");

-- AddForeignKey
ALTER TABLE "ShoppingList"
ADD CONSTRAINT "ShoppingList_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "ShoppingList"
ADD CONSTRAINT "ShoppingList_private_lists_require_creator"
CHECK (NOT "isPrivate" OR "createdById" IS NOT NULL);
