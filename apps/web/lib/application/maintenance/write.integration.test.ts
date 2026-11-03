import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createToolRegistry } from "../../mcp/tools"
import { createHouseholdFixtures } from "../../test/household-fixtures"
import { MAX_BATCH_SIZE } from "../mutations"
import {
  bulkImportMaintenanceTasks,
  bulkImportMaintenanceTasksWithDuplicates,
} from "./import"
import {
  addProgressEntry,
  addTaskVendor,
  createMaintenanceTask,
  deleteMaintenanceTask,
  deleteProgressEntry,
  deleteTaskVendor,
  setSelectedVendor,
  updateMaintenanceTask,
  updateProgressEntry,
  updateTaskVendor,
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

/** A task with one vendor and one progress entry in a fresh household. */
async function taskWithChildren() {
  const household = await fixtures.createHousehold()
  const task = await createMaintenanceTask(household.context, {
    title: "Male fasade",
  })
  const vendor = await addTaskVendor(household.context, task.id, {
    name: "Malermester AS",
  })
  const entry = await addProgressEntry(household.context, task.id, {
    title: "Kjøpe maling",
  })
  return { ...household, task, vendor, entry }
}

describe("maintenance task service", () => {
  it("creates a task with normalized fields and a calendar due date", async () => {
    const { context, householdId } = await fixtures.createHousehold()

    const task = await createMaintenanceTask(context, {
      title: "  Rense takrenner ",
      description: "",
      dueDate: "2026-10-01",
      estimatedPrice: 1999.999,
    })

    expect(task).toMatchObject({
      title: "Rense takrenner",
      description: null,
      householdId,
      priority: "MEDIUM",
      status: "NOT_STARTED",
    })
    expect(task.dueDate?.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(task.estimatedPrice?.toString()).toBe("2000")
  })

  it("rejects an unknown status instead of storing it", async () => {
    const { context } = await fixtures.createHousehold()
    const task = await createMaintenanceTask(context, { title: "Bytte filter" })

    await expect(
      updateMaintenanceTask(context, task.id, { status: "DONE" as never })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("rejects a stale expectedUpdatedAt with CONFLICT", async () => {
    const { context } = await fixtures.createHousehold()
    const task = await createMaintenanceTask(context, { title: "Sjekke pipe" })
    await updateMaintenanceTask(context, task.id, { status: "IN_PROGRESS" })

    await expect(
      updateMaintenanceTask(context, task.id, {
        status: "COMPLETED",
        expectedUpdatedAt: task.updatedAt,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})

describe("household boundary", () => {
  it("every id-taking service answers NOT_FOUND for another household's ids", async () => {
    const owner = await taskWithChildren()
    const intruder = await fixtures.createHousehold()
    const ctx = intruder.context

    // Thunks, run one at a time: each call must see the untouched data.
    const attempts = [
      () => updateMaintenanceTask(ctx, owner.task.id, { title: "Stjålet" }),
      () => deleteMaintenanceTask(ctx, owner.task.id),
      () => addTaskVendor(ctx, owner.task.id, { name: "Inntrenger AS" }),
      () => updateTaskVendor(ctx, owner.vendor.id, { name: "Stjålet" }),
      () => deleteTaskVendor(ctx, owner.vendor.id),
      () => setSelectedVendor(ctx, owner.task.id, owner.vendor.id),
      () => setSelectedVendor(ctx, owner.task.id, null),
      () => addProgressEntry(ctx, owner.task.id, { title: "Stjålet" }),
      () => updateProgressEntry(ctx, owner.entry.id, { completed: true }),
      () => deleteProgressEntry(ctx, owner.entry.id),
    ]

    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({ code: "NOT_FOUND" })
    }

    const task = await db.maintenanceTask.findUniqueOrThrow({
      where: { id: owner.task.id },
      include: { vendors: true, progressEntries: true },
    })
    expect(task.title).toBe("Male fasade")
    expect(task.vendors).toEqual([
      expect.objectContaining({ name: "Malermester AS", isSelected: false }),
    ])
    expect(task.progressEntries).toEqual([
      expect.objectContaining({ title: "Kjøpe maling", completed: false }),
    ])
  })

  it("a child id cannot be reached through the intruder's own task", async () => {
    const owner = await taskWithChildren()
    const intruder = await taskWithChildren()

    // The intruder's task is legitimate; the vendor id is not on it.
    await expect(
      setSelectedVendor(intruder.context, intruder.task.id, owner.vendor.id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(
      (
        await db.taskVendor.findUniqueOrThrow({
          where: { id: owner.vendor.id },
        })
      ).isSelected
    ).toBe(false)
  })
})

describe("vendor selection", () => {
  it("a vendor from task A cannot be selected on task B in the same household", async () => {
    const { context, task: taskA, vendor: vendorA } = await taskWithChildren()
    const taskB = await createMaintenanceTask(context, { title: "Ny terrasse" })
    const vendorB = await addTaskVendor(context, taskB.id, { name: "Snekker" })
    await setSelectedVendor(context, taskB.id, vendorB.id)

    await expect(
      setSelectedVendor(context, taskB.id, vendorA.id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    // The failed call rolled back entirely: B's selection is intact.
    const vendors = await db.taskVendor.findMany({
      where: { taskId: { in: [taskA.id, taskB.id] } },
    })
    expect(
      vendors.filter((vendor) => vendor.isSelected).map((vendor) => vendor.id)
    ).toEqual([vendorB.id])
  })

  it("selects exactly one vendor, is idempotent, and null clears it", async () => {
    const { context, task, vendor: first } = await taskWithChildren()
    const second = await addTaskVendor(context, task.id, {
      name: "Fasadeeksperten",
    })

    await setSelectedVendor(context, task.id, first.id)
    const afterSwitch = await setSelectedVendor(context, task.id, second.id)
    const afterRetry = await setSelectedVendor(context, task.id, second.id)

    for (const vendors of [afterSwitch, afterRetry]) {
      expect(
        vendors.filter((vendor) => vendor.isSelected).map((vendor) => vendor.id)
      ).toEqual([second.id])
    }

    const cleared = await setSelectedVendor(context, task.id, null)
    expect(cleared.every((vendor) => !vendor.isSelected)).toBe(true)
  })

  it("update-task-vendor never changes the selection", async () => {
    const { context, task, vendor } = await taskWithChildren()
    await setSelectedVendor(context, task.id, vendor.id)

    const updated = await updateTaskVendor(context, vendor.id, {
      // Not part of the service input; must be ignored even if sent.
      ...({ isSelected: false } as object),
      phone: "12345678",
    })

    expect(updated).toMatchObject({ phone: "12345678", isSelected: true })
  })

  it("rejects a non-http vendor website", async () => {
    const { context, task } = await taskWithChildren()

    await expect(
      addTaskVendor(context, task.id, {
        name: "Skummel AS",
        website: "javascript:alert(1)",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })
})

describe("progress entries", () => {
  it("appends new entries after the last one by default", async () => {
    const { context, task } = await taskWithChildren()
    await addProgressEntry(context, task.id, { title: "Vaske", sortOrder: 7 })

    const appended = await addProgressEntry(context, task.id, { title: "Male" })

    expect(appended.sortOrder).toBe(8)
  })

  it("keeps the first completedAt on retry and clears it on reopen", async () => {
    const { context, entry } = await taskWithChildren()
    let tick = 0
    const clock = () => new Date(Date.UTC(2026, 10, 1, 12, 0, tick++))

    const completed = await updateProgressEntry(
      context,
      entry.id,
      { completed: true },
      clock
    )
    const retried = await updateProgressEntry(
      context,
      entry.id,
      { completed: true, title: "Kjøpe maling og pensler" },
      clock
    )

    expect(completed.completedAt?.toISOString()).toBe(
      "2026-11-01T12:00:00.000Z"
    )
    expect(retried.completedAt).toEqual(completed.completedAt)
    expect(retried.title).toBe("Kjøpe maling og pensler")

    const reopened = await updateProgressEntry(context, entry.id, {
      completed: false,
    })
    expect(reopened).toMatchObject({ completed: false, completedAt: null })
  })

  it("leaves completion alone when completed is not supplied", async () => {
    const { context, entry } = await taskWithChildren()
    const completed = await updateProgressEntry(context, entry.id, {
      completed: true,
    })

    const renamed = await updateProgressEntry(context, entry.id, {
      title: "Nytt navn",
    })

    expect(renamed.completed).toBe(true)
    expect(renamed.completedAt).toEqual(completed.completedAt)
  })

  it("rejects a stale expectedUpdatedAt with CONFLICT", async () => {
    const { context, entry } = await taskWithChildren()
    await updateProgressEntry(context, entry.id, { title: "Endret" })

    await expect(
      updateProgressEntry(context, entry.id, {
        completed: true,
        expectedUpdatedAt: entry.updatedAt,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})

describe("bulk import", () => {
  it("rejects a batch above the shared maximum", async () => {
    const { context } = await fixtures.createHousehold()
    const tasks = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, index) => ({
      title: `Oppgave ${index}`,
    }))

    await expect(
      bulkImportMaintenanceTasks(context, tasks)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    expect(
      await db.maintenanceTask.count({
        where: { householdId: context.householdId },
      })
    ).toBe(0)
  })

  it("accepts priority case-insensitively and defaults a missing one to MEDIUM", async () => {
    const { context } = await fixtures.createHousehold()

    await bulkImportMaintenanceTasks(context, [
      { title: "Haster", priority: "high" },
      { title: "Uten prioritet" },
    ])

    const tasks = await db.maintenanceTask.findMany({
      where: { householdId: context.householdId },
      orderBy: { title: "asc" },
    })
    expect(tasks.map((task) => [task.title, task.priority])).toEqual([
      ["Haster", "HIGH"],
      ["Uten prioritet", "MEDIUM"],
    ])
  })

  it("rejects an unknown priority or an invalid date, naming the task, and writes nothing", async () => {
    const { context } = await fixtures.createHousehold()

    await expect(
      bulkImportMaintenanceTasks(context, [
        { title: "Grei" },
        { title: "Rar", priority: "URGENT" },
      ])
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("«Rar»"),
    })
    await expect(
      bulkImportMaintenanceTasks(context, [
        { title: "Feil dato", dueDate: "2026-02-30" },
      ])
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("«Feil dato»"),
    })
    expect(
      await db.maintenanceTask.count({
        where: { householdId: context.householdId },
      })
    ).toBe(0)
  })

  it("cannot update another household's task and rolls back the new tasks", async () => {
    const owner = await taskWithChildren()
    const intruder = await fixtures.createHousehold()

    await expect(
      bulkImportMaintenanceTasksWithDuplicates(intruder.context, {
        newTasks: [{ title: "Ny" }],
        updates: [{ id: owner.task.id, fields: { description: "Stjålet" } }],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    expect(
      (
        await db.maintenanceTask.findUniqueOrThrow({
          where: { id: owner.task.id },
        })
      ).description
    ).toBeNull()
    expect(
      await db.maintenanceTask.count({
        where: { householdId: intruder.householdId },
      })
    ).toBe(0)
  })

  it("applies selected field updates, and an empty dueDate clears the date", async () => {
    const { context } = await fixtures.createHousehold()
    const task = await createMaintenanceTask(context, {
      title: "Service varmepumpe",
      dueDate: "2026-09-01",
    })

    const result = await bulkImportMaintenanceTasksWithDuplicates(context, {
      newTasks: [],
      updates: [{ id: task.id, fields: { priority: "low", dueDate: "" } }],
    })

    expect(result.count).toBe(1)
    const updated = await db.maintenanceTask.findUniqueOrThrow({
      where: { id: task.id },
    })
    expect(updated).toMatchObject({ priority: "LOW", dueDate: null })
  })
})

describe("maintenance write tools", () => {
  it("set-selected-vendor returns the task's vendors and records an audit event", async () => {
    const { context, task, vendor } = await taskWithChildren()
    const session = fixtures.session(context, ["maintenance:write"])

    const result = await tool("set-selected-vendor").invoke(
      { taskId: task.id, vendorId: vendor.id },
      session
    )

    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toMatchObject({
      taskId: task.id,
      selectedVendorId: vendor.id,
      vendors: [{ id: vendor.id, isSelected: true, estimatedPrice: null }],
    })

    const audit = await db.mcpAuditEvent.findFirstOrThrow({
      where: { correlationId: session.correlationId },
    })
    expect(audit).toMatchObject({
      toolName: "set-selected-vendor",
      resourceType: "maintenance_task",
      resourceId: task.id,
      outcome: "success",
      householdId: context.householdId,
    })
  })

  it("update-progress-entry on another household's entry is NOT_FOUND and audited", async () => {
    const owner = await taskWithChildren()
    const intruder = await fixtures.createHousehold()
    const session = fixtures.session(intruder.context, ["maintenance:write"])

    const result = await tool("update-progress-entry").invoke(
      { entryId: owner.entry.id, completed: true },
      session
    )

    expect(result.structuredContent).toMatchObject({
      error: { code: "NOT_FOUND" },
    })
    const audit = await db.mcpAuditEvent.findFirstOrThrow({
      where: { correlationId: session.correlationId },
    })
    expect(audit).toMatchObject({ outcome: "not_found", resourceId: null })
  })

  it("create-maintenance-task returns the get-maintenance-task shape", async () => {
    const { context } = await fixtures.createHousehold()
    const session = fixtures.session(context, ["maintenance:write"])

    const result = await tool("create-maintenance-task").invoke(
      {
        title: "Bytte pakninger",
        priority: "HIGH",
        dueDate: "2026-12-01",
        estimatedPrice: 450,
      },
      session
    )

    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toMatchObject({
      task: {
        title: "Bytte pakninger",
        priority: "HIGH",
        status: "NOT_STARTED",
        dueDate: "2026-12-01",
        estimatedPrice: "450",
      },
    })
  })
})
