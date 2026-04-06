-- CreateEnum
CREATE TYPE "BudgetLoanType" AS ENUM ('MORTGAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "TripTransportType" AS ENUM ('AIR_OR_PUBLIC', 'CAR');

-- AlterTable
ALTER TABLE "BudgetLoan"
ADD COLUMN "loanType" "BudgetLoanType" NOT NULL DEFAULT 'MORTGAGE';

-- CreateTable
CREATE TABLE "BudgetTrip" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budgetId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "transportType" "TripTransportType" NOT NULL,
    "annualTrips" INTEGER NOT NULL DEFAULT 1,
    "ticketPerTrip" DECIMAL(10,2),
    "tollPerTrip" DECIMAL(10,2),
    "ferryPerTrip" DECIMAL(10,2),
    "fuelPerTrip" DECIMAL(10,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetTrip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetTrip_budgetId_sortOrder_idx" ON "BudgetTrip"("budgetId", "sortOrder");

-- AddForeignKey
ALTER TABLE "BudgetTrip" ADD CONSTRAINT "BudgetTrip_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
