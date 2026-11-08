import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createToolRegistry } from "../../mcp/tools"
import { createHouseholdFixtures } from "../../test/household-fixtures"
import { createShoppingList, updateShoppingList } from "../shopping/write"
import { getProject } from "./read"
import {
  addProjectStep,
  addProjectVendor,
  createProject,
  deleteProject,
  deleteProjectStep,
  deleteProjectVendor,
  reorderProjectSteps,
  setSelectedVendor,
  updateProject,
  updateProjectStep,
  updateProjectVendor,
} from "./write"

const fixtures = createHouseholdFixtures()

afterAll(async () => {
  await fixtures.cleanup()
  await db.$disconnect()
})

function tool(name: string) {
  const found = createToolRegistry().find((step) => step.name === name)
  if (!found) throw new Error(`Unknown tool ${name}`)
  return found
}

/** A project with one vendor and one step in a fresh household. */
async function projectWithChildren() {
  const household = await fixtures.createHousehold()
  const project = await createProject(household.context, {
    title: "Male fasade",
  })
  const vendor = await addProjectVendor(household.context, project.id, {
    name: "Malermester AS",
  })
  const step = await addProjectStep(household.context, project.id, {
    title: "Kjøpe maling",
  })
  return { ...household, project, vendor, step }
}

describe("project service", () => {
  it("creates a project with normalized fields and a calendar due date", async () => {
    const { context, householdId } = await fixtures.createHousehold()

    const project = await createProject(context, {
      title: "  Rense takrenner ",
      description: "",
      dueDate: "2026-10-01",
      estimatedPrice: 1999.999,
    })

    expect(project).toMatchObject({
      title: "Rense takrenner",
      description: null,
      householdId,
      priority: "MEDIUM",
      status: "NOT_STARTED",
    })
    expect(project.dueDate?.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(project.estimatedPrice?.toString()).toBe("2000")
  })

  it("rejects an unknown status instead of storing it", async () => {
    const { context } = await fixtures.createHousehold()
    const project = await createProject(context, { title: "Bytte filter" })

    await expect(
      updateProject(context, project.id, { status: "DONE" as never })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("rejects a stale expectedUpdatedAt with CONFLICT", async () => {
    const { context } = await fixtures.createHousehold()
    const project = await createProject(context, { title: "Sjekke pipe" })
    await updateProject(context, project.id, { status: "IN_PROGRESS" })

    await expect(
      updateProject(context, project.id, {
        status: "COMPLETED",
        expectedUpdatedAt: project.updatedAt,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})

describe("household boundary", () => {
  it("every id-taking service answers NOT_FOUND for another household's ids", async () => {
    const owner = await projectWithChildren()
    const intruder = await fixtures.createHousehold()
    const ctx = intruder.context

    // Thunks, run one at a time: each call must see the untouched data.
    const attempts = [
      () => updateProject(ctx, owner.project.id, { title: "Stjålet" }),
      () => deleteProject(ctx, owner.project.id),
      () => addProjectVendor(ctx, owner.project.id, { name: "Inntrenger AS" }),
      () => updateProjectVendor(ctx, owner.vendor.id, { name: "Stjålet" }),
      () => deleteProjectVendor(ctx, owner.vendor.id),
      () => setSelectedVendor(ctx, owner.project.id, owner.vendor.id),
      () => setSelectedVendor(ctx, owner.project.id, null),
      () => addProjectStep(ctx, owner.project.id, { title: "Stjålet" }),
      () => updateProjectStep(ctx, owner.step.id, { completed: true }),
      () => deleteProjectStep(ctx, owner.step.id),
      () => reorderProjectSteps(ctx, owner.project.id, [owner.step.id]),
    ]

    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({ code: "NOT_FOUND" })
    }

    const project = await db.project.findUniqueOrThrow({
      where: { id: owner.project.id },
      include: { vendors: true, steps: true },
    })
    expect(project.title).toBe("Male fasade")
    expect(project.vendors).toEqual([
      expect.objectContaining({ name: "Malermester AS", isSelected: false }),
    ])
    expect(project.steps).toEqual([
      expect.objectContaining({ title: "Kjøpe maling", completed: false }),
    ])
  })

  it("a child id cannot be reached through the intruder's own project", async () => {
    const owner = await projectWithChildren()
    const intruder = await projectWithChildren()

    // The intruder's project is legitimate; the vendor id is not on it.
    await expect(
      setSelectedVendor(intruder.context, intruder.project.id, owner.vendor.id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(
      (
        await db.projectVendor.findUniqueOrThrow({
          where: { id: owner.vendor.id },
        })
      ).isSelected
    ).toBe(false)
  })
})

describe("vendor selection", () => {
  it("a vendor from project A cannot be selected on project B in the same household", async () => {
    const {
      context,
      project: projectA,
      vendor: vendorA,
    } = await projectWithChildren()
    const projectB = await createProject(context, { title: "Ny terrasse" })
    const vendorB = await addProjectVendor(context, projectB.id, {
      name: "Snekker",
    })
    await setSelectedVendor(context, projectB.id, vendorB.id)

    await expect(
      setSelectedVendor(context, projectB.id, vendorA.id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    // The failed call rolled back entirely: B's selection is intact.
    const vendors = await db.projectVendor.findMany({
      where: { projectId: { in: [projectA.id, projectB.id] } },
    })
    expect(
      vendors.filter((vendor) => vendor.isSelected).map((vendor) => vendor.id)
    ).toEqual([vendorB.id])
  })

  it("selects exactly one vendor, is idempotent, and null clears it", async () => {
    const { context, project, vendor: first } = await projectWithChildren()
    const second = await addProjectVendor(context, project.id, {
      name: "Fasadeeksperten",
    })

    await setSelectedVendor(context, project.id, first.id)
    const afterSwitch = await setSelectedVendor(context, project.id, second.id)
    const afterRetry = await setSelectedVendor(context, project.id, second.id)

    for (const vendors of [afterSwitch, afterRetry]) {
      expect(
        vendors.filter((vendor) => vendor.isSelected).map((vendor) => vendor.id)
      ).toEqual([second.id])
    }

    const cleared = await setSelectedVendor(context, project.id, null)
    expect(cleared.every((vendor) => !vendor.isSelected)).toBe(true)
  })

  it("update-project-vendor never changes the selection", async () => {
    const { context, project, vendor } = await projectWithChildren()
    await setSelectedVendor(context, project.id, vendor.id)

    const updated = await updateProjectVendor(context, vendor.id, {
      // Not part of the service input; must be ignored even if sent.
      ...({ isSelected: false } as object),
      phone: "12345678",
    })

    expect(updated).toMatchObject({ phone: "12345678", isSelected: true })
  })

  it("rejects a non-http vendor website", async () => {
    const { context, project } = await projectWithChildren()

    await expect(
      addProjectVendor(context, project.id, {
        name: "Skummel AS",
        website: "javascript:alert(1)",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })
})

describe("project steps", () => {
  it("appends new entries after the last one by default", async () => {
    const { context, project } = await projectWithChildren()
    await addProjectStep(context, project.id, { title: "Vaske", sortOrder: 7 })

    const appended = await addProjectStep(context, project.id, {
      title: "Male",
    })

    expect(appended.sortOrder).toBe(8)
  })

  it("keeps the first completedAt on retry and clears it on reopen", async () => {
    const { context, step } = await projectWithChildren()
    let tick = 0
    const clock = () => new Date(Date.UTC(2026, 10, 1, 12, 0, tick++))

    const completed = await updateProjectStep(
      context,
      step.id,
      { completed: true },
      clock
    )
    const retried = await updateProjectStep(
      context,
      step.id,
      { completed: true, title: "Kjøpe maling og pensler" },
      clock
    )

    expect(completed.completedAt?.toISOString()).toBe(
      "2026-11-01T12:00:00.000Z"
    )
    expect(retried.completedAt).toEqual(completed.completedAt)
    expect(retried.title).toBe("Kjøpe maling og pensler")

    const reopened = await updateProjectStep(context, step.id, {
      completed: false,
    })
    expect(reopened).toMatchObject({ completed: false, completedAt: null })
  })

  it("leaves completion alone when completed is not supplied", async () => {
    const { context, step } = await projectWithChildren()
    const completed = await updateProjectStep(context, step.id, {
      completed: true,
    })

    const renamed = await updateProjectStep(context, step.id, {
      title: "Nytt navn",
    })

    expect(renamed.completed).toBe(true)
    expect(renamed.completedAt).toEqual(completed.completedAt)
  })

  it("rejects a stale expectedUpdatedAt with CONFLICT", async () => {
    const { context, step } = await projectWithChildren()
    await updateProjectStep(context, step.id, { title: "Endret" })

    await expect(
      updateProjectStep(context, step.id, {
        completed: true,
        expectedUpdatedAt: step.updatedAt,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})

describe("project write tools", () => {
  it("set-selected-vendor returns the project's vendors and records an audit event", async () => {
    const { context, project, vendor } = await projectWithChildren()
    const session = fixtures.session(context, ["maintenance:write"])

    const result = await tool("set-selected-project-vendor").invoke(
      { projectId: project.id, vendorId: vendor.id },
      session
    )

    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toMatchObject({
      projectId: project.id,
      selectedVendorId: vendor.id,
      vendors: [{ id: vendor.id, isSelected: true, estimatedPrice: null }],
    })

    const audit = await db.mcpAuditEvent.findFirstOrThrow({
      where: { correlationId: session.correlationId },
    })
    expect(audit).toMatchObject({
      toolName: "set-selected-project-vendor",
      resourceType: "project",
      resourceId: project.id,
      outcome: "success",
      householdId: context.householdId,
    })
  })

  it("update-project-step on another household's step is NOT_FOUND and audited", async () => {
    const owner = await projectWithChildren()
    const intruder = await fixtures.createHousehold()
    const session = fixtures.session(intruder.context, ["maintenance:write"])

    const result = await tool("update-project-step").invoke(
      { stepId: owner.step.id, completed: true },
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

  it("create-project returns the get-project shape", async () => {
    const { context } = await fixtures.createHousehold()
    const session = fixtures.session(context, ["maintenance:write"])

    const result = await tool("create-project").invoke(
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
      project: {
        title: "Bytte pakninger",
        priority: "HIGH",
        status: "NOT_STARTED",
        dueDate: "2026-12-01",
        estimatedPrice: "450",
      },
    })
  })
})

describe("project kinds", () => {
  it("defaults to type OTHER with no execution, and rejects unknown values", async () => {
    const { context } = await fixtures.createHousehold()
    const project = await createProject(context, { title: "Bygge hylle" })

    expect(project).toMatchObject({ type: "OTHER", execution: null })

    const updated = await updateProject(context, project.id, {
      type: "IMPROVEMENT",
      execution: "SELF",
    })
    expect(updated).toMatchObject({ type: "IMPROVEMENT", execution: "SELF" })

    const cleared = await updateProject(context, project.id, {
      execution: null,
    })
    expect(cleared.execution).toBeNull()

    await expect(
      updateProject(context, project.id, { execution: "FRIENDS" as never })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(
      updateProject(context, project.id, { type: null as never })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("creates steps in order and vendors in one call, or nothing at all", async () => {
    const { context, householdId } = await fixtures.createHousehold()

    const project = await createProject(context, {
      title: "Pusse opp bad",
      type: "RENOVATION",
      execution: "MIXED",
      steps: [
        { title: "Rive fliser" },
        { title: "Membran", dueDate: "2026-12-01" },
      ],
      vendors: [{ name: "Rørlegger AS", estimatedPrice: 15000 }],
    })

    expect(project.steps.map((step) => [step.title, step.sortOrder])).toEqual([
      ["Rive fliser", 0],
      ["Membran", 1],
    ])
    expect(project.vendors).toEqual([
      expect.objectContaining({ name: "Rørlegger AS", isSelected: false }),
    ])

    await expect(
      createProject(context, {
        title: "Ugyldig",
        steps: [{ title: "Grei" }, { title: "   " }],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    expect(
      await db.project.count({ where: { householdId, title: "Ugyldig" } })
    ).toBe(0)
  })
})

describe("step order", () => {
  it("sets the full order and rejects a list that is not exactly the steps", async () => {
    const { context, project, step: first } = await projectWithChildren()
    const second = await addProjectStep(context, project.id, {
      title: "Grunne",
    })
    const third = await addProjectStep(context, project.id, { title: "Male" })

    const reordered = await reorderProjectSteps(context, project.id, [
      third.id,
      first.id,
      second.id,
    ])
    expect(reordered.map((step) => step.id)).toEqual([
      third.id,
      first.id,
      second.id,
    ])

    for (const stepIds of [
      [third.id, first.id],
      [third.id, first.id, second.id, second.id],
    ]) {
      await expect(
        reorderProjectSteps(context, project.id, stepIds)
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    }
  })

  it("cannot pull another project's step into the order", async () => {
    const { context, project } = await projectWithChildren()
    const other = await createProject(context, { title: "Annet" })
    const foreign = await addProjectStep(context, other.id, {
      title: "Fremmed",
    })
    const own = await db.projectStep.findMany({
      where: { projectId: project.id },
    })

    await expect(
      reorderProjectSteps(context, project.id, [
        ...own.map((step) => step.id),
        foreign.id,
      ])
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })
})

describe("project purchases", () => {
  it("links a list to a project and keeps the list when the project is deleted", async () => {
    const { context } = await fixtures.createHousehold()
    const project = await createProject(context, { title: "Ny terrasse" })
    const list = await createShoppingList(context, {
      name: "Terrassematerialer",
      projectId: project.id,
    })
    expect(list.projectId).toBe(project.id)

    const read = await getProject(context, project.id)
    expect(read?.shoppingLists.map((entry) => entry.id)).toEqual([list.id])

    await deleteProject(context, project.id)

    const kept = await db.shoppingList.findUniqueOrThrow({
      where: { id: list.id },
    })
    expect(kept.projectId).toBeNull()
  })

  it("rejects a project from another household on create and update", async () => {
    const owner = await projectWithChildren()
    const intruder = await fixtures.createHousehold()
    const list = await createShoppingList(intruder.context, { name: "Min" })

    await expect(
      createShoppingList(intruder.context, {
        name: "Stjålet",
        projectId: owner.project.id,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(
      updateShoppingList(intruder.context, list.id, {
        projectId: owner.project.id,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })

    expect(
      await db.shoppingList.count({ where: { projectId: owner.project.id } })
    ).toBe(0)
  })

  it("unlinks with null and hides another member's private list", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    const partner = await fixtures.addMember(householdId)
    const project = await createProject(context, { title: "Male stue" })
    const shared = await createShoppingList(context, {
      name: "Felles",
      projectId: project.id,
    })
    await createShoppingList(partner, {
      name: "Hemmelig",
      isPrivate: true,
      projectId: project.id,
    })

    const mine = await getProject(context, project.id)
    expect(mine?.shoppingLists.map((entry) => entry.name)).toEqual(["Felles"])

    const unlinked = await updateShoppingList(context, shared.id, {
      projectId: null,
    })
    expect(unlinked.projectId).toBeNull()
  })
})

describe("project delete tools", () => {
  it("delete-project-step and delete-project-vendor remove one child and are audited", async () => {
    const { context, project, vendor, step } = await projectWithChildren()
    const session = fixtures.session(context, ["maintenance:write"])

    const stepResult = await tool("delete-project-step").invoke(
      { stepId: step.id },
      session
    )
    const vendorResult = await tool("delete-project-vendor").invoke(
      { vendorId: vendor.id },
      session
    )

    expect(stepResult.structuredContent).toEqual({
      projectId: project.id,
      deletedStepId: step.id,
    })
    expect(vendorResult.structuredContent).toEqual({
      projectId: project.id,
      deletedVendorId: vendor.id,
    })

    const audits = await db.mcpAuditEvent.findMany({
      where: { correlationId: session.correlationId },
      orderBy: { createdAt: "asc" },
    })
    expect(audits.map((audit) => [audit.toolName, audit.outcome])).toEqual([
      ["delete-project-step", "success"],
      ["delete-project-vendor", "success"],
    ])
  })

  it("delete-project on another household's project is NOT_FOUND and leaves it", async () => {
    const owner = await projectWithChildren()
    const intruder = await fixtures.createHousehold()

    const result = await tool("delete-project").invoke(
      { projectId: owner.project.id },
      fixtures.session(intruder.context, ["maintenance:write"])
    )

    expect(result.structuredContent).toMatchObject({
      error: { code: "NOT_FOUND" },
    })
    expect(await db.project.count({ where: { id: owner.project.id } })).toBe(1)
  })
})
