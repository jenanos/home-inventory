-- CreateEnum
CREATE TYPE "BudgetEntryType" AS ENUM ('INCOME', 'EXPENSE', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "BudgetCategory" AS ENUM ('ELECTRICITY', 'MUNICIPAL_FEES', 'INSURANCE', 'HOME_MAINTENANCE', 'TRANSPORT', 'SUBSCRIPTIONS', 'FOOD', 'CHILDREN', 'PERSONAL', 'SAVINGS', 'BUFFER');

-- CreateTable
CREATE TABLE "Budget" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "householdId" UUID NOT NULL,
    "taxDeductionPercent" DECIMAL(5,2) NOT NULL DEFAULT 22,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetMember" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budgetId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "grossMonthlyIncome" DECIMAL(10,2) NOT NULL,
    "taxPercent" DECIMAL(5,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLoan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budgetId" UUID NOT NULL,
    "bankName" TEXT NOT NULL,
    "loanName" TEXT NOT NULL,
    "monthlyInterest" DECIMAL(10,2) NOT NULL,
    "monthlyPrincipal" DECIMAL(10,2) NOT NULL,
    "monthlyFees" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budgetId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "BudgetCategory",
    "type" "BudgetEntryType" NOT NULL,
    "monthlyAmount" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Budget_householdId_key" ON "Budget"("householdId");

-- CreateIndex
CREATE INDEX "BudgetMember_budgetId_sortOrder_idx" ON "BudgetMember"("budgetId", "sortOrder");

-- CreateIndex
CREATE INDEX "BudgetLoan_budgetId_sortOrder_idx" ON "BudgetLoan"("budgetId", "sortOrder");

-- CreateIndex
CREATE INDEX "BudgetEntry_budgetId_sortOrder_idx" ON "BudgetEntry"("budgetId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMember" ADD CONSTRAINT "BudgetMember_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLoan" ADD CONSTRAINT "BudgetLoan_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetEntry" ADD CONSTRAINT "BudgetEntry_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
