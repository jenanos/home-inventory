-- Additive only: the MCP audit trail (ADR 0004). Rolling the application back
-- does not require dropping this table.

-- CreateTable
CREATE TABLE "McpAuditEvent" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "clientId" VARCHAR(512) NOT NULL,
    "toolName" VARCHAR(100) NOT NULL,
    "resourceType" VARCHAR(50) NOT NULL,
    "resourceId" UUID,
    "outcome" VARCHAR(32) NOT NULL,
    "correlationId" UUID,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "McpAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "McpAuditEvent_householdId_createdAt_idx" ON "McpAuditEvent"("householdId", "createdAt");

-- CreateIndex
CREATE INDEX "McpAuditEvent_clientId_createdAt_idx" ON "McpAuditEvent"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "McpAuditEvent_createdAt_idx" ON "McpAuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "McpAuditEvent" ADD CONSTRAINT "McpAuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpAuditEvent" ADD CONSTRAINT "McpAuditEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
