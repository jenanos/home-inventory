-- Items the household wants to hear about when they are on offer.
ALTER TABLE "ShoppingItem" ADD COLUMN "dealWatch" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShoppingItem" ADD COLUMN "dealWatchNote" TEXT;
ALTER TABLE "ShoppingItem" ADD COLUMN "dealTargetPrice" DECIMAL(10,2);
ALTER TABLE "ShoppingItem" ADD COLUMN "dealCheckedAt" TIMESTAMP(3);

CREATE INDEX "ShoppingItem_dealWatch_idx" ON "ShoppingItem"("dealWatch");

-- The best store offer found for an item, reported through the MCP server.
CREATE TABLE "ShoppingItemDeal" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "store" TEXT NOT NULL,
    "productName" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "regularPrice" DECIMAL(10,2),
    "priceNote" TEXT,
    "url" TEXT,
    "validFrom" DATE,
    "validTo" DATE,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingItemDeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShoppingItemDeal_itemId_key" ON "ShoppingItemDeal"("itemId");

ALTER TABLE "ShoppingItemDeal" ADD CONSTRAINT "ShoppingItemDeal_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ShoppingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
