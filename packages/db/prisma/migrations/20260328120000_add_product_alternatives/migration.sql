-- CreateTable
CREATE TABLE "ProductAlternative" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "url" TEXT,
    "storeName" TEXT,
    "notes" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "itemId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAlternative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductAlternative_itemId_rank_idx" ON "ProductAlternative"("itemId", "rank");

-- AddForeignKey
ALTER TABLE "ProductAlternative" ADD CONSTRAINT "ProductAlternative_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ShoppingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
