import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createHouseholdFixtures } from "../test/household-fixtures"
import { MCP_AUDIT_RETENTION_DAYS } from "./audit"
import { runMcpCleanup } from "./cleanup"
import type { McpConfig } from "./config"

const fixtures = createHouseholdFixtures()

afterAll(async () => {
  await fixtures.cleanup()
  await db.$disconnect()
})

const config: McpConfig = {
  enabled: true,
  issuer: "https://home.example.test",
  resource: "https://home.example.test/api/mcp",
  signingSecret: "cleanup-test-secret".padEnd(32, "-"),
  accessTokenTtlSeconds: 1800,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  clockSkewSeconds: 30,
  writeDomains: [],
}

describe("runMcpCleanup", () => {
  it("removes audit events past the retention period and keeps recent ones", async () => {
    const { context } = await fixtures.createHousehold()
    // Far in the past on purpose: the cleanup deletes every expired row in the
    // shared test database, and other suites run in parallel. Nothing they
    // create expires before this instant.
    const now = new Date("2020-01-01T12:00:00Z")
    const old = new Date(
      now.getTime() - (MCP_AUDIT_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000
    )
    const base = {
      userId: context.userId,
      householdId: context.householdId,
      clientId: "cleanup-test",
      toolName: "create-plant",
      resourceType: "plant",
      outcome: "success",
      durationMs: 1,
    }
    const [expired, recent] = await Promise.all([
      db.mcpAuditEvent.create({ data: { ...base, createdAt: old } }),
      db.mcpAuditEvent.create({ data: { ...base, createdAt: now } }),
    ])

    const result = await runMcpCleanup(config, now)

    expect(result.oauth).not.toBeNull()
    expect(result.auditEvents).toBeGreaterThanOrEqual(1)
    expect(
      await db.mcpAuditEvent.findUnique({ where: { id: expired.id } })
    ).toBeNull()
    expect(
      await db.mcpAuditEvent.findUnique({ where: { id: recent.id } })
    ).not.toBeNull()
  })

  it("still prunes the audit trail when MCP is switched off", async () => {
    const result = await runMcpCleanup(
      { enabled: false, reason: "disabled-by-operator" },
      new Date("2020-01-01T12:00:00Z")
    )

    expect(result.oauth).toBeNull()
  })
})
