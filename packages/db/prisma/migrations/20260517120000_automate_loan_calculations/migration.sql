-- CreateEnum
CREATE TYPE "BudgetLoanRepaymentType" AS ENUM ('ANNUITY', 'SERIAL');

-- AlterTable
ALTER TABLE "BudgetLoan"
ADD COLUMN "repaymentType" "BudgetLoanRepaymentType" NOT NULL DEFAULT 'ANNUITY',
ADD COLUMN "principalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "annualInterestRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN "termMonths" INTEGER NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "BudgetLoan"
DROP COLUMN "monthlyInterest",
DROP COLUMN "monthlyPrincipal";
