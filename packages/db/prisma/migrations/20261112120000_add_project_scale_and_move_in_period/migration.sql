-- Projects are split into routine upkeep and larger construction jobs.
CREATE TYPE "ProjectScale" AS ENUM ('ROUTINE', 'MAJOR');

ALTER TABLE "Project" ADD COLUMN "scale" "ProjectScale" NOT NULL DEFAULT 'ROUTINE';

-- One-time best guess for existing rows; the household corrects it in the UI.
-- Renovations and improvements are larger jobs, and so is anything estimated
-- at 50 000 NOK or more.
UPDATE "Project"
SET "scale" = 'MAJOR'
WHERE "type" IN ('RENOVATION', 'IMPROVEMENT')
   OR "estimatedPrice" >= 50000;

-- The last day of the move-in period, for splitting purchase numbers.
ALTER TABLE "Household" ADD COLUMN "moveInPeriodEndsOn" DATE;
