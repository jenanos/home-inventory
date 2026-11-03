import { db } from "@workspace/db"

import type { ApplicationContext } from "../application/context"
import type { McpSession } from "../mcp/auth/session"
import { expandEffectiveScopes, type McpScope } from "../mcp/oauth/scopes"

/**
 * Integration-test fixtures against the test database (`.env.test`). Every
 * household and user created here is tracked and removed by `cleanup()`, and
 * all domain rows cascade from the household, so suites can run against a
 * shared database without seeing each other's data.
 */
export function createHouseholdFixtures() {
  const householdIds: string[] = []
  const userIds: string[] = []

  async function createUser() {
    const user = await db.user.create({
      data: { email: `fixture-${crypto.randomUUID()}@example.test` },
    })
    userIds.push(user.id)
    return user
  }

  /** A household with one member, and the context that member acts in. */
  async function createHousehold(): Promise<{
    householdId: string
    userId: string
    context: ApplicationContext
  }> {
    const household = await db.household.create({
      data: { name: `Fixture ${crypto.randomUUID()}` },
    })
    householdIds.push(household.id)

    const user = await createUser()
    await db.householdMember.create({
      data: { userId: user.id, householdId: household.id, role: "OWNER" },
    })

    return {
      householdId: household.id,
      userId: user.id,
      context: { userId: user.id, householdId: household.id, role: "OWNER" },
    }
  }

  /** A second member of an existing household. */
  async function addMember(householdId: string): Promise<ApplicationContext> {
    const user = await createUser()
    await db.householdMember.create({
      data: { userId: user.id, householdId, role: "MEMBER" },
    })
    return { userId: user.id, householdId, role: "MEMBER" }
  }

  function session(
    context: ApplicationContext,
    scopes: McpScope[]
  ): McpSession {
    return {
      context,
      scopes: expandEffectiveScopes(scopes),
      clientId: "integration-test-client",
      tokenId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
    }
  }

  async function cleanup() {
    await db.household.deleteMany({ where: { id: { in: householdIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
  }

  return { createHousehold, addMember, createUser, session, cleanup }
}
