import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createHouseholdFixtures } from "../../test/household-fixtures"
import { getApplicationContext } from "../context"
import { deleteUserAccount } from "./delete"

const fixtures = createHouseholdFixtures()

afterAll(async () => {
  await fixtures.cleanup()
  await db.$disconnect()
})

describe("deleteUserAccount", () => {
  it("succeeds for a user who owns a private list, and removes only private lists", async () => {
    const { householdId, userId } = await fixtures.createHousehold()
    const privateList = await db.shoppingList.create({
      data: {
        name: "Gaver",
        householdId,
        createdById: userId,
        isPrivate: true,
      },
    })
    const sharedList = await db.shoppingList.create({
      data: { name: "Felles", householdId, createdById: userId },
    })

    await expect(deleteUserAccount(userId)).resolves.toEqual({
      deletedPrivateLists: 1,
    })

    expect(
      await db.shoppingList.findUnique({ where: { id: privateList.id } })
    ).toBeNull()
    expect(
      await db.shoppingList.findUniqueOrThrow({ where: { id: sharedList.id } })
    ).toMatchObject({ createdById: null, isPrivate: false })
  })

  it("removes MCP access in the same commit", async () => {
    const { userId } = await fixtures.createHousehold()
    const client = await db.mcpOAuthClient.create({
      data: {
        id: `mcp-dcr-test-${crypto.randomUUID()}`,
        name: "Test",
        redirectUris: ["https://client.example.test/cb"],
        grantTypes: ["authorization_code"],
        responseTypes: ["code"],
        registrationSource: "DYNAMIC",
      },
    })
    await db.mcpOAuthGrant.create({
      data: { userId, clientId: client.id, scopes: ["garden:read"] },
    })

    await deleteUserAccount(userId)

    expect(await db.mcpOAuthGrant.count({ where: { userId } })).toBe(0)
    await expect(getApplicationContext(userId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await db.mcpOAuthClient.delete({ where: { id: client.id } })
  })

  it("refuses to delete an admin", async () => {
    const user = await fixtures.createUser()
    await db.user.update({ where: { id: user.id }, data: { isAdmin: true } })

    await expect(deleteUserAccount(user.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    expect(await db.user.count({ where: { id: user.id } })).toBe(1)
  })
})
