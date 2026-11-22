-- "Når" (timeframe) overlapped almost entirely with priority, and the due date
-- covers real deadlines. Priority is now the only urgency field on an item.
ALTER TABLE "ShoppingItem" DROP COLUMN "timeframe";

DROP TYPE "Timeframe";
