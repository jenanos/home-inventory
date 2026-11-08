-- The shopping list was built for a house move. The move-in phases become a
-- general timeframe; existing values are kept by renaming in place:
--   BEFORE_MOVE -> NOW, FIRST_WEEK -> SOON, CAN_WAIT -> LATER, NO_RUSH -> SOMEDAY
ALTER TYPE "Phase" RENAME TO "Timeframe";
ALTER TYPE "Timeframe" RENAME VALUE 'BEFORE_MOVE' TO 'NOW';
ALTER TYPE "Timeframe" RENAME VALUE 'FIRST_WEEK' TO 'SOON';
ALTER TYPE "Timeframe" RENAME VALUE 'CAN_WAIT' TO 'LATER';
ALTER TYPE "Timeframe" RENAME VALUE 'NO_RUSH' TO 'SOMEDAY';

ALTER TABLE "ShoppingItem" RENAME COLUMN "phase" TO "timeframe";
