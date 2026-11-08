"use server"

import type {
  Priority,
  ProjectExecution,
  ProjectStatus,
  ProjectType,
} from "@workspace/db"
import {
  addProjectStep,
  addProjectVendor,
  createProject as createProjectService,
  deleteProject as deleteProjectService,
  deleteProjectStep as deleteProjectStepService,
  deleteProjectVendor as deleteProjectVendorService,
  setSelectedVendor,
  updateProject as updateProjectService,
  updateProjectStep as updateProjectStepService,
  updateProjectVendor as updateProjectVendorService,
} from "@/lib/application/projects/write"
import {
  createShoppingList,
  updateShoppingList,
} from "@/lib/application/shopping/write"
import { db } from "@workspace/db"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

// Thin adapters: the browser context comes from the session, while the rules
// and the ownership boundary live in the project services shared with MCP.
// Decimals are converted to numbers here because a Prisma `Decimal` cannot
// cross the server action boundary.

function withNumericPrice<
  T extends { estimatedPrice: { toString(): string } | null },
>(row: T) {
  return {
    ...row,
    estimatedPrice: row.estimatedPrice ? Number(row.estimatedPrice) : null,
  }
}

function revalidateProject(projectId?: string) {
  revalidatePath("/prosjekter")
  revalidatePath("/")
  if (projectId) revalidatePath(`/prosjekter/${projectId}`)
}

// ─── Projects ───────────────────────────────────────────────────

interface CreateProjectInput {
  title: string
  description?: string
  type?: ProjectType
  execution?: ProjectExecution | null
  priority?: Priority
  estimatedDuration?: string
  estimatedPrice?: number
  dueDate?: Date
}

export async function createProject(input: CreateProjectInput) {
  const { context } = await requireHousehold()
  const project = await createProjectService(context, input)

  revalidateProject()
  return withNumericPrice(project)
}

interface UpdateProjectInput {
  id: string
  title?: string
  description?: string | null
  type?: ProjectType
  execution?: ProjectExecution | null
  priority?: Priority
  status?: ProjectStatus
  estimatedDuration?: string | null
  estimatedPrice?: number | null
  dueDate?: Date | null
}

export async function updateProject(input: UpdateProjectInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const updated = await updateProjectService(context, id, fields)

  revalidateProject(id)
  return withNumericPrice(updated)
}

export async function deleteProject(projectId: string) {
  const { context } = await requireHousehold()
  await deleteProjectService(context, projectId)

  revalidateProject()
  revalidatePath("/lists")
}

// ─── Vendors ────────────────────────────────────────────────────

interface CreateProjectVendorInput {
  projectId: string
  name: string
  description?: string
  phone?: string
  email?: string
  website?: string
  estimatedPrice?: number
  notes?: string
}

export async function createProjectVendor(input: CreateProjectVendorInput) {
  const { context } = await requireHousehold()
  const { projectId, ...fields } = input
  const vendor = await addProjectVendor(context, projectId, fields)

  revalidatePath(`/prosjekter/${projectId}`)
  return withNumericPrice(vendor)
}

interface UpdateProjectVendorInput {
  id: string
  name?: string
  description?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  estimatedPrice?: number | null
  notes?: string | null
}

export async function updateProjectVendor(input: UpdateProjectVendorInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const updated = await updateProjectVendorService(context, id, fields)

  revalidatePath(`/prosjekter/${updated.projectId}`)
  return withNumericPrice(updated)
}

export async function deleteProjectVendor(vendorId: string) {
  const { context } = await requireHousehold()
  const vendor = await deleteProjectVendorService(context, vendorId)

  revalidatePath(`/prosjekter/${vendor.projectId}`)
}

export async function selectProjectVendor(vendorId: string) {
  const { context } = await requireHousehold()

  // The UI only knows the vendor id. Its project is looked up through the
  // household boundary; `setSelectedVendor` then checks again in its writes.
  const vendor = await db.projectVendor.findFirst({
    where: { id: vendorId, project: { householdId: context.householdId } },
    select: { projectId: true },
  })
  if (!vendor) {
    throw new Error("Vendor not found")
  }

  await setSelectedVendor(context, vendor.projectId, vendorId)

  revalidateProject(vendor.projectId)
}

// ─── Steps ──────────────────────────────────────────────────────

interface CreateProjectStepInput {
  projectId: string
  title: string
  description?: string
  dueDate?: Date
  sortOrder?: number
}

export async function createProjectStep(input: CreateProjectStepInput) {
  const { context } = await requireHousehold()
  const { projectId, ...fields } = input
  const step = await addProjectStep(context, projectId, fields)

  revalidateProject(projectId)
  return step
}

interface UpdateProjectStepInput {
  id: string
  title?: string
  description?: string | null
  dueDate?: Date | null
  completed?: boolean
  sortOrder?: number
}

export async function updateProjectStep(input: UpdateProjectStepInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const updated = await updateProjectStepService(context, id, fields)

  revalidateProject(updated.projectId)
  return updated
}

export async function deleteProjectStep(stepId: string) {
  const { context } = await requireHousehold()
  const step = await deleteProjectStepService(context, stepId)

  revalidateProject(step.projectId)
}

// ─── Purchases ──────────────────────────────────────────────────

/** Creates a shopping list that buys for the project and returns its id. */
export async function createProjectShoppingList(input: {
  projectId: string
  name: string
}) {
  const { context } = await requireHousehold()
  const list = await createShoppingList(context, {
    name: input.name,
    projectId: input.projectId,
  })

  revalidateProject(input.projectId)
  revalidatePath("/lists")
  return { id: list.id }
}

/** Links an existing list to the project, or unlinks it with `null`. */
export async function setShoppingListProject(input: {
  listId: string
  projectId: string | null
  /** The project the list was on, so its page is refreshed when unlinking. */
  previousProjectId?: string | null
}) {
  const { context } = await requireHousehold()
  await updateShoppingList(context, input.listId, {
    projectId: input.projectId,
  })

  for (const projectId of [input.projectId, input.previousProjectId]) {
    if (projectId) revalidatePath(`/prosjekter/${projectId}`)
  }
  revalidatePath("/prosjekter")
  revalidatePath(`/lists/${input.listId}`)
  revalidatePath("/lists")
}
