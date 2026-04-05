-- AlterTable
ALTER TABLE "Budget" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BudgetEntry" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BudgetLoan" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BudgetMember" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MaintenanceTask" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TaskProgressEntry" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TaskVendor" ALTER COLUMN "id" DROP DEFAULT;
