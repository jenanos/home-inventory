import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createHouseholdFixtures } from "../../test/household-fixtures"
import { createToolRegistry } from "../../mcp/tools"
import { createPlant, deletePlant, updatePlant } from "./write"

const fixtures = createHouseholdFixtures()

afterAll(async () => {
  await fixtures.cleanup()
  await db.$disconnect()
})

function tool(name: string) {
  const found = createToolRegistry().find((entry) => entry.name === name)
  if (!found) throw new Error(`Unknown tool ${name}`)
  return found
}

describe("garden write service", () => {
  it("creates a plant in the caller's household with normalized fields", async () => {
    const { context, householdId } = await fixtures.createHousehold()

    const plant = await createPlant(context, {
      name: "  Lavendel ",
      location: "",
      plantedAt: "2026-05-01",
      wateringNeed: "LOW",
    })

    expect(plant).toMatchObject({
      name: "Lavendel",
      location: null,
      householdId,
      wateringNeed: "LOW",
    })
    expect(plant.plantedAt?.toISOString()).toBe("2026-05-01T00:00:00.000Z")
  })

  it("rejects an unknown enum value instead of falling back", async () => {
    const { context } = await fixtures.createHousehold()

    await expect(
      createPlant(context, {
        name: "Rose",
        // Simulates a server action called with a value outside the type.
        sunNeed: "MOONLIGHT" as never,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("rejects a non-http URL rather than silently dropping it", async () => {
    const { context } = await fixtures.createHousehold()

    await expect(
      createPlant(context, { name: "Rose", imageUrl: "javascript:alert(1)" })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("updates only supplied fields and clears fields set to null", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, {
      name: "Hortensia",
      location: "Nordvegg",
      notes: "Trenger mye vann",
    })

    const updated = await updatePlant(context, plant.id, { notes: null })

    expect(updated).toMatchObject({
      name: "Hortensia",
      location: "Nordvegg",
      notes: null,
    })
  })

  it("cannot update or delete another household's plant, and says NOT_FOUND", async () => {
    const owner = await fixtures.createHousehold()
    const intruder = await fixtures.createHousehold()
    const plant = await createPlant(owner.context, { name: "Eple" })

    await expect(
      updatePlant(intruder.context, plant.id, { name: "Stjålet" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(deletePlant(intruder.context, plant.id)).rejects.toMatchObject(
      { code: "NOT_FOUND" }
    )

    const untouched = await db.plant.findUniqueOrThrow({
      where: { id: plant.id },
    })
    expect(untouched.name).toBe("Eple")
  })

  it("rejects a stale expectedUpdatedAt with CONFLICT", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Tomat" })
    await updatePlant(context, plant.id, { location: "Drivhus" })

    await expect(
      updatePlant(context, plant.id, {
        location: "Balkong",
        expectedUpdatedAt: plant.updatedAt,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("accepts a current expectedUpdatedAt", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Basilikum" })

    const updated = await updatePlant(context, plant.id, {
      location: "Kjøkkenvindu",
      expectedUpdatedAt: plant.updatedAt,
    })

    expect(updated.location).toBe("Kjøkkenvindu")
  })
})

describe("garden write tools", () => {
  it("create-plant saves through the service and records an audit event", async () => {
    const { context } = await fixtures.createHousehold()
    const session = fixtures.session(context, ["garden:write"])

    const result = await tool("create-plant").invoke(
      { name: "Rosmarin", plantedAt: "2026-04-20" },
      session
    )

    expect(result.isError).toBeUndefined()
    const plant = (result.structuredContent as { plant: { id: string } }).plant
    expect(plant).toMatchObject({ name: "Rosmarin", plantedAt: "2026-04-20" })

    const audit = await db.mcpAuditEvent.findFirstOrThrow({
      where: { correlationId: session.correlationId },
    })
    expect(audit).toMatchObject({
      toolName: "create-plant",
      resourceType: "plant",
      resourceId: plant.id,
      outcome: "success",
      userId: context.userId,
      householdId: context.householdId,
      clientId: "integration-test-client",
    })
  })

  it("update-plant on another household's plant is NOT_FOUND and audited as such", async () => {
    const owner = await fixtures.createHousehold()
    const intruder = await fixtures.createHousehold()
    const plant = await createPlant(owner.context, { name: "Pære" })
    const session = fixtures.session(intruder.context, ["garden:write"])

    const result = await tool("update-plant").invoke(
      { plantId: plant.id, name: "Endret" },
      session
    )

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({
      error: { code: "NOT_FOUND" },
    })
    const audit = await db.mcpAuditEvent.findFirstOrThrow({
      where: { correlationId: session.correlationId },
    })
    expect(audit).toMatchObject({ outcome: "not_found", resourceId: null })
  })

  it("a garden:read token cannot call create-plant, and nothing is audited", async () => {
    const { context } = await fixtures.createHousehold()
    const session = fixtures.session(context, ["garden:read"])

    const result = await tool("create-plant").invoke({ name: "Nei" }, session)

    expect(result.structuredContent).toMatchObject({
      error: { code: "SCOPE_REQUIRED" },
    })
    expect(
      await db.plant.count({ where: { householdId: context.householdId } })
    ).toBe(0)
  })
})
