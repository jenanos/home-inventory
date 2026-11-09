import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createHouseholdFixtures } from "../../test/household-fixtures"
import { createToolRegistry } from "../../mcp/tools"
import {
  addPlants,
  createPlant,
  deletePlant,
  recordPlantCare,
  updatePlant,
} from "./write"

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

describe("garden batches", () => {
  it("adds plants and skips names already in the garden or the batch", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    const existing = await createPlant(context, { name: "Lavendel" })

    const { created, skipped } = await addPlants(context, [
      { name: "lavendel", location: "Sørvegg" },
      { name: "Rosmarin", plantType: "HERB" },
      { name: "ROSMARIN" },
    ])

    expect(created.map((plant) => plant.name)).toEqual(["Rosmarin"])
    expect(skipped).toEqual([
      { name: "lavendel", existingPlantId: existing.id },
      { name: "ROSMARIN", existingPlantId: created[0]?.id },
    ])
    expect(await db.plant.count({ where: { householdId } })).toBe(2)
  })

  it("creates repeated names on request", async () => {
    const { context } = await fixtures.createHousehold()
    await createPlant(context, { name: "Rose", location: "Bed A" })

    const { created, skipped } = await addPlants(
      context,
      [{ name: "Rose", location: "Bed B" }],
      { onDuplicate: "create" }
    )

    expect(created).toHaveLength(1)
    expect(skipped).toEqual([])
  })

  it("saves nothing when one plant in the batch is invalid", async () => {
    const { context, householdId } = await fixtures.createHousehold()

    await expect(
      addPlants(context, [
        { name: "Tulipan" },
        { name: "Krokus", wateringNeed: "LOTS" as never },
      ])
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("Plante 2"),
    })
    expect(await db.plant.count({ where: { householdId } })).toBe(0)
  })

  it("records care and never moves a date backwards", async () => {
    const { context } = await fixtures.createHousehold()
    const now = new Date("2026-07-10T12:00:00Z")
    const recent = await createPlant(context, {
      name: "Hortensia",
      lastWateredAt: "2026-07-09T08:00:00Z",
    })
    const dry = await createPlant(context, { name: "Tomat" })

    const plants = await recordPlantCare(
      context,
      [recent.id, dry.id],
      { watered: true, at: "2026-07-08T18:00:00Z" },
      now
    )

    expect(
      Object.fromEntries(
        plants.map((plant) => [plant.name, plant.lastWateredAt?.toISOString()])
      )
    ).toEqual({
      Hortensia: "2026-07-09T08:00:00.000Z",
      Tomat: "2026-07-08T18:00:00.000Z",
    })
    expect(plants.every((plant) => plant.lastPrunedAt === null)).toBe(true)

    const pruned = await recordPlantCare(
      context,
      [dry.id],
      { pruned: true },
      now
    )
    expect(pruned[0]?.lastPrunedAt?.toISOString()).toBe(now.toISOString())
  })

  it("rejects care in the future or with nothing to record", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Bregne" })
    const now = new Date("2026-07-10T12:00:00Z")

    await expect(
      recordPlantCare(
        context,
        [plant.id],
        { watered: true, at: "2026-07-11T12:00:00Z" },
        now
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(
      recordPlantCare(context, [plant.id], {}, now)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("changes nothing when one plant belongs to another household", async () => {
    const owner = await fixtures.createHousehold()
    const intruder = await fixtures.createHousehold()
    const own = await createPlant(intruder.context, { name: "Egen" })
    const foreign = await createPlant(owner.context, { name: "Fremmed" })

    await expect(
      recordPlantCare(intruder.context, [own.id, foreign.id], {
        watered: true,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    const untouched = await db.plant.findMany({
      where: { id: { in: [own.id, foreign.id] } },
    })
    expect(untouched.every((plant) => plant.lastWateredAt === null)).toBe(true)
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

  it("add-plants reports created and skipped plants with missing fields", async () => {
    const { context } = await fixtures.createHousehold()
    const existing = await createPlant(context, { name: "Syrin" })
    const session = fixtures.session(context, ["garden:write"])

    const result = await tool("add-plants").invoke(
      {
        plants: [
          { name: "Syrin" },
          { name: "Eplehage", plantType: "TREE", species: "Malus domestica" },
        ],
      },
      session
    )

    expect(result.isError).toBeUndefined()
    const structured = result.structuredContent as {
      created: Array<{ name: string; missingFields: string[] }>
      skipped: Array<{ existingPlantId: string }>
    }
    expect(structured.skipped).toEqual([
      { name: "Syrin", existingPlantId: existing.id },
    ])
    expect(structured.created[0]?.missingFields).toContain("pruningSeason")
    expect(structured.created[0]?.missingFields).not.toContain("species")
  })

  it("record-plant-care and delete-plant are audited", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Gressløk" })
    const careSession = fixtures.session(context, ["garden:write"])

    const care = await tool("record-plant-care").invoke(
      { plantIds: [plant.id], watered: true },
      careSession
    )
    expect(care.isError).toBeUndefined()
    expect(
      (care.structuredContent as { plants: Array<{ lastWateredAt: string }> })
        .plants[0]?.lastWateredAt
    ).toBeTruthy()

    const deleteSession = fixtures.session(context, ["garden:write"])
    const deleted = await tool("delete-plant").invoke(
      { plantId: plant.id },
      deleteSession
    )
    expect(deleted.structuredContent).toEqual({
      deleted: { id: plant.id, name: "Gressløk" },
    })
    expect(await db.plant.count({ where: { id: plant.id } })).toBe(0)

    const audits = await db.mcpAuditEvent.findMany({
      where: {
        correlationId: {
          in: [careSession, deleteSession].map(
            (session) => session.correlationId ?? ""
          ),
        },
      },
      orderBy: { createdAt: "asc" },
    })
    expect(audits.map((audit) => [audit.toolName, audit.outcome])).toEqual([
      ["record-plant-care", "success"],
      ["delete-plant", "success"],
    ])
  })
})
