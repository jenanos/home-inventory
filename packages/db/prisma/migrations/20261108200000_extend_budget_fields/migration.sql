-- Budget: more fields for MCP clients and better formulas (ADR 0007).
-- The entry amount is renamed in place; every existing entry was monthly, so
-- the new frequency column defaults to MONTHLY and no amount changes.

-- AlterEnum
ALTER TYPE "BudgetEntryType" ADD VALUE 'SAVINGS';

-- AlterEnum
ALTER TYPE "BudgetLoanType" ADD VALUE 'STUDENT' BEFORE 'OTHER';
ALTER TYPE "BudgetLoanType" ADD VALUE 'CAR' BEFORE 'OTHER';
ALTER TYPE "BudgetLoanType" ADD VALUE 'CONSUMER' BEFORE 'OTHER';

-- CreateEnum
CREATE TYPE "BudgetFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY');

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN "propertyValue" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "BudgetMember" ADD COLUMN "netMonthlyIncome" DECIMAL(10,2),
ADD COLUMN "notes" TEXT;

-- AlterTable
ALTER TABLE "BudgetLoan" ADD COLUMN "fixedRateUntil" DATE,
ADD COLUMN "notes" TEXT;

-- AlterTable
ALTER TABLE "BudgetTrip" ADD COLUMN "otherPerTrip" DECIMAL(10,2),
ADD COLUMN "notes" TEXT;

-- AlterTable
ALTER TABLE "BudgetEntry" RENAME COLUMN "monthlyAmount" TO "amount";
ALTER TABLE "BudgetEntry" ADD COLUMN "frequency" "BudgetFrequency" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN "provider" TEXT,
ADD COLUMN "paymentDay" INTEGER,
ADD COLUMN "renewalDate" DATE,
ADD COLUMN "notes" TEXT;
