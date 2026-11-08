-- The maintenance page was built for taking over the house. It now holds every
-- home project, including ones the household does itself. Tables, columns,
-- constraints and the status enum are renamed in place, so all data is kept.

-- Status enum
ALTER TYPE "TaskStatus" RENAME TO "ProjectStatus";

-- Projects
ALTER TABLE "MaintenanceTask" RENAME TO "Project";
ALTER TABLE "Project" RENAME CONSTRAINT "MaintenanceTask_pkey" TO "Project_pkey";
ALTER TABLE "Project" RENAME CONSTRAINT "MaintenanceTask_householdId_fkey" TO "Project_householdId_fkey";

-- Vendors
ALTER TABLE "TaskVendor" RENAME TO "ProjectVendor";
ALTER TABLE "ProjectVendor" RENAME COLUMN "taskId" TO "projectId";
ALTER TABLE "ProjectVendor" RENAME CONSTRAINT "TaskVendor_pkey" TO "ProjectVendor_pkey";
ALTER TABLE "ProjectVendor" RENAME CONSTRAINT "TaskVendor_taskId_fkey" TO "ProjectVendor_projectId_fkey";

-- Progress entries become steps
ALTER TABLE "TaskProgressEntry" RENAME TO "ProjectStep";
ALTER TABLE "ProjectStep" RENAME COLUMN "taskId" TO "projectId";
ALTER TABLE "ProjectStep" RENAME CONSTRAINT "TaskProgressEntry_pkey" TO "ProjectStep_pkey";
ALTER TABLE "ProjectStep" RENAME CONSTRAINT "TaskProgressEntry_taskId_fkey" TO "ProjectStep_projectId_fkey";
ALTER INDEX "TaskProgressEntry_taskId_sortOrder_idx" RENAME TO "ProjectStep_projectId_sortOrder_idx";

-- Project type: everything that exists today came from the maintenance list.
CREATE TYPE "ProjectType" AS ENUM ('MAINTENANCE', 'REPAIR', 'RENOVATION', 'IMPROVEMENT', 'OTHER');
ALTER TABLE "Project" ADD COLUMN "type" "ProjectType" NOT NULL DEFAULT 'MAINTENANCE';
ALTER TABLE "Project" ALTER COLUMN "type" SET DEFAULT 'OTHER';

-- Who does the work. Projects that already have vendors were meant for one;
-- the rest stay undecided.
CREATE TYPE "ProjectExecution" AS ENUM ('SELF', 'VENDOR', 'MIXED');
ALTER TABLE "Project" ADD COLUMN "execution" "ProjectExecution";
UPDATE "Project" SET "execution" = 'VENDOR'
WHERE EXISTS (SELECT 1 FROM "ProjectVendor" v WHERE v."projectId" = "Project"."id");

-- Shopping lists can buy for a project.
ALTER TABLE "ShoppingList" ADD COLUMN "projectId" UUID;
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "Project_householdId_status_idx" ON "Project"("householdId", "status");
CREATE INDEX "ProjectVendor_projectId_idx" ON "ProjectVendor"("projectId");
CREATE INDEX "ShoppingList_projectId_idx" ON "ShoppingList"("projectId");
