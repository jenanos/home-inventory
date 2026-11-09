import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createHouseholdFixtures } from "../../test/household-fixtures"
import { createToolRegistry } from "../../mcp/tools"
import {
  addPlants,
  createGardenBed,
  createPlant,
  deleteGardenBed,
  deletePlant,
  recordPlantCare,
  updateGardenBed,
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
      species: "",
      plantedAt: "2026-05-01",
      wateringNeed: "LOW",
    })

    expect(plant).toMatchObject({
      name: "Lavendel",
      species: null,
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
      species: "Hydrangea",
      notes: "Trenger mye vann",
    })

    const updated = await updatePlant(context, plant.id, { notes: null })

    expect(updated).toMatchObject({
      name: "Hortensia",
      species: "Hydrangea",
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
    await updatePlant(context, plant.id, { notes: "Drivhus" })

    await expect(
      updatePlant(context, plant.id, {
        notes: "Balkong",
        expectedUpdatedAt: plant.updatedAt,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("accepts a current expectedUpdatedAt", async () => {
    const { context } = await fixtures.createHousehold()
    const plant = await createPlant(context, { name: "Basilikum" })

    const updated = await updatePlant(context, plant.id, {
      notes: "Kjøkkenvindu",
      expectedUpdatedAt: plant.updatedAt,
    })

    expect(updated.notes).toBe("Kjøkkenvindu")
  })
})

describe("garden beds and placements", () => {
  it("places one plant in several beds and replaces the set on update", async () => {
    const { context } = await fixtures.createHousehold()
    const left = await createGardenBed(context, { name: "Venstre staudebed" })
    const right = await createGardenBed(context, { name: "Høyre staudebed" })
    const corten = await createGardenBed(context, { name: "Cortenstålbed" })

    const plant = await createPlant(context, {
      name: "Hosta",
      placements: [
        { bedId: left.id, quantity: 3 },
        { bedId: right.id, notes: "Bakerst" },
      ],
    })
    expect(
      plant.placements.map((placement) => [
        placement.bed.name,
        placement.quantity,
        placement.notes,
      ])
    ).toEqual([
      ["Høyre staudebed", null, "Bakerst"],
      ["Venstre staudebed", 3, null],
    ])

    const moved = await updatePlant(context, plant.id, {
      placements: [{ bedId: right.id }, { bedId: corten.id, quantity: 1 }],
    })
    expect(
      moved.placements.map((placement) => [
        placement.bed.name,
        placement.quantity,
        placement.notes,
      ])
    ).toEqual([
      ["Cortenstålbed", 1, null],
      // Omitted fields on a kept placement are left alone.
      ["Høyre staudebed", null, "Bakerst"],
    ])
    expect(moved.updatedAt.getTime()).toBeGreaterThan(plant.updatedAt.getTime())
  })

  it("leaves placements alone when the update does not mention them", async () => {
    const { context } = await fixtures.createHousehold()
    const bed = await createGardenBed(context, { name: "Bed" })
    const plant = await createPlant(context, {
      name: "Rose",
      placements: [{ bedId: bed.id }],
    })

    const updated = await updatePlant(context, plant.id, { notes: "Duftende" })
    expect(updated.placements).toHaveLength(1)
  })

  it("refuses a bed from another household with NOT_FOUND", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const foreignBed = await createGardenBed(other.context, { name: "Fremmed" })

    await expect(
      createPlant(owner.context, {
        name: "Rose",
        placements: [{ bedId: foreignBed.id }],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    const plant = await createPlant(owner.context, { name: "Rose" })
    await expect(
      updatePlant(owner.context, plant.id, {
        placements: [{ bedId: foreignBed.id }],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("rejects the same bed twice and a quantity below one", async () => {
    const { context } = await fixtures.createHousehold()
    const bed = await createGardenBed(context, { name: "Bed" })

    await expect(
      createPlant(context, {
        name: "Rose",
        placements: [{ bedId: bed.id }, { bedId: bed.id }],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(
      createPlant(context, {
        name: "Rose",
        placements: [{ bedId: bed.id, quantity: 0 }],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("keeps bed names unique per household, ignoring case", async () => {
    const { context } = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const bed = await createGardenBed(context, { name: "Staudebed" })
    const second = await createGardenBed(context, { name: "Kjøkkenhage" })

    await expect(
      createGardenBed(context, { name: "staudebed" })
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(
      updateGardenBed(context, second.id, { name: "STAUDEBED" })
    ).rejects.toMatchObject({ code: "CONFLICT" })
    // Renaming a bed to a new casing of its own name is fine.
    await expect(
      updateGardenBed(context, bed.id, { name: "staudebed" })
    ).resolves.toMatchObject({ name: "staudebed" })
    // Another household may use the same name.
    await expect(
      createGardenBed(other.context, { name: "Staudebed" })
    ).resolves.toMatchObject({ name: "Staudebed" })
  })

  it("deleting a bed keeps its plants", async () => {
    const { context } = await fixtures.createHousehold()
    const bed = await createGardenBed(context, { name: "Bed" })
    const plant = await createPlant(context, {
      name: "Rose",
      placements: [{ bedId: bed.id }],
    })

    await deleteGardenBed(context, bed.id)

    const kept = await db.plant.findUniqueOrThrow({
      where: { id: plant.id },
      include: { placements: true },
    })
    expect(kept.placements).toHaveLength(0)
  })

  it("cannot change or delete another household's bed", async () => {
    const owner = await fixtures.createHousehold()
    const intruder = await fixtures.createHousehold()
    const bed = await createGardenBed(owner.context, { name: "Mitt" })

    await expect(
      updateGardenBed(intruder.context, bed.id, { name: "Stjålet" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      deleteGardenBed(intruder.context, bed.id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("garden batches", () => {
  it("adds plants and skips names already in the garden or the batch", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    const existing = await createPlant(context, { name: "Lavendel" })

    const { created, skipped } = await addPlants(context, [
      { name: "lavendel", notes: "Sørvegg" },
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
    await createPlant(context, { name: "Rose", species: "Rosa" })

    const { created, skipped } = await addPlants(
      context,
      [{ name: "Rose", species: "Rosa rugosa" }],
      { onDuplicate: "create" }
    )

    expect(created).toHaveLength(1)
    expect(skipped).toEqual([])
  })

  it("places batch plants in beds, and checks every bed first", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const bed = await createGardenBed(context, { name: "Kjøkkenhage" })
    const foreign = await createGardenBed(other.context, { name: "Fremmed" })

    const { created } = await addPlants(context, [
      { name: "Gressløk", placements: [{ bedId: bed.id, quantity: 2 }] },
      { name: "Persille", placements: [{ bedId: bed.id }] },
    ])
    expect(
      created.map((plant) => [plant.name, plant.placements[0]?.bed.name])
    ).toEqual([
      ["Gressløk", "Kjøkkenhage"],
      ["Persille", "Kjøkkenhage"],
    ])

    await expect(
      addPlants(context, [
        { name: "Dill", placements: [{ bedId: bed.id }] },
        { name: "Mynte", placements: [{ bedId: foreign.id }] },
      ])
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(await db.plant.count({ where: { householdId } })).toBe(2)
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
  it("create-garden-bed and create-plant with placements round-trip through MCP", async () => {
    const { context } = await fixtures.createHousehold()
    const session = fixtures.session(context, ["garden:write"])

    const bedResult = await tool("create-garden-bed").invoke(
      { name: "Kjøkkenhage", sunExposure: "FULL_SUN" },
      session
    )
    expect(bedResult.isError).toBeUndefined()
    const bed = (bedResult.structuredContent as { bed: { id: string } }).bed

    const plantResult = await tool("create-plant").invoke(
      { name: "Gressløk", placements: [{ bedId: bed.id, quantity: 2 }] },
      session
    )
    expect(plantResult.isError).toBeUndefined()
    expect(plantResult.structuredContent).toMatchObject({
      plant: {
        name: "Gressløk",
        placements: [
          { bedId: bed.id, bedName: "Kjøkkenhage", quantity: 2, notes: null },
        ],
      },
    })

    const listed = await tool("list-garden-beds").invoke({}, session)
    expect(listed.structuredContent).toMatchObject({
      beds: [
        {
          name: "Kjøkkenhage",
          sunExposure: "FULL_SUN",
          plants: [{ name: "Gressløk", quantity: 2 }],
        },
      ],
    })

    const filtered = await tool("list-plants").invoke(
      { bed: "kjøkken" },
      session
    )
    expect(filtered.structuredContent).toMatchObject({
      plants: [{ name: "Gressløk" }],
      pageInfo: { totalCount: 1 },
    })
  })

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
