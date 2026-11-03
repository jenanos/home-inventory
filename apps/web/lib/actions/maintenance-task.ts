"use server"

import { db, type Priority, type TaskStatus } from "@workspace/db"
import {
  bulkImportMaintenanceTasks as bulkImportMaintenanceTasksService,
  bulkImportMaintenanceTasksWithDuplicates as bulkImportMaintenanceTasksWithDuplicatesService,
  findExistingMaintenanceTasks as findExistingMaintenanceTasksService,
  toMaintenanceTaskCreateData,
  type BulkMaintenanceTaskInput,
  type ExistingMaintenanceTask,
  type MaintenanceTaskFieldUpdate,
} from "@/lib/application/maintenance/import"
import {
  addProgressEntry,
  addTaskVendor,
  createMaintenanceTask as createMaintenanceTaskService,
  deleteMaintenanceTask as deleteMaintenanceTaskService,
  deleteProgressEntry as deleteProgressEntryService,
  deleteTaskVendor as deleteTaskVendorService,
  setSelectedVendor,
  updateMaintenanceTask as updateMaintenanceTaskService,
  updateProgressEntry as updateProgressEntryService,
  updateTaskVendor as updateTaskVendorService,
} from "@/lib/application/maintenance/write"
import { assertBatchSize } from "@/lib/application/mutations"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

// Thin adapters: the browser context comes from the session, while the rules
// and the ownership boundary live in the maintenance services shared with MCP.
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

// --- MaintenanceTask actions ---

interface CreateMaintenanceTaskInput {
  title: string
  description?: string
  priority?: Priority
  estimatedDuration?: string
  estimatedPrice?: number
  dueDate?: Date
}

export async function createMaintenanceTask(input: CreateMaintenanceTaskInput) {
  const { context } = await requireHousehold()
  const task = await createMaintenanceTaskService(context, input)

  revalidatePath("/vedlikehold")
  return withNumericPrice(task)
}

interface UpdateMaintenanceTaskInput {
  id: string
  title?: string
  description?: string | null
  priority?: Priority
  status?: TaskStatus
  estimatedDuration?: string | null
  estimatedPrice?: number | null
  dueDate?: Date | null
}

export async function updateMaintenanceTask(input: UpdateMaintenanceTaskInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const updated = await updateMaintenanceTaskService(context, id, fields)

  revalidatePath("/vedlikehold")
  revalidatePath(`/vedlikehold/${id}`)
  return withNumericPrice(updated)
}

export async function deleteMaintenanceTask(taskId: string) {
  const { context } = await requireHousehold()
  await deleteMaintenanceTaskService(context, taskId)

  revalidatePath("/vedlikehold")
}

// --- TaskVendor actions ---

interface CreateTaskVendorInput {
  taskId: string
  name: string
  description?: string
  phone?: string
  email?: string
  website?: string
  estimatedPrice?: number
  notes?: string
}

export async function createTaskVendor(input: CreateTaskVendorInput) {
  const { context } = await requireHousehold()
  const { taskId, ...fields } = input
  const vendor = await addTaskVendor(context, taskId, fields)

  revalidatePath(`/vedlikehold/${taskId}`)
  return withNumericPrice(vendor)
}

interface UpdateTaskVendorInput {
  id: string
  name?: string
  description?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  estimatedPrice?: number | null
  notes?: string | null
}

export async function updateTaskVendor(input: UpdateTaskVendorInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const updated = await updateTaskVendorService(context, id, fields)

  revalidatePath(`/vedlikehold/${updated.taskId}`)
  return withNumericPrice(updated)
}

export async function deleteTaskVendor(vendorId: string) {
  const { context } = await requireHousehold()
  const vendor = await deleteTaskVendorService(context, vendorId)

  revalidatePath(`/vedlikehold/${vendor.taskId}`)
}

export async function selectTaskVendor(vendorId: string) {
  const { context } = await requireHousehold()

  // The UI only knows the vendor id. Its task is looked up through the
  // household boundary; `setSelectedVendor` then checks again in its writes.
  const vendor = await db.taskVendor.findFirst({
    where: { id: vendorId, task: { householdId: context.householdId } },
    select: { taskId: true },
  })
  if (!vendor) {
    throw new Error("Vendor not found")
  }

  await setSelectedVendor(context, vendor.taskId, vendorId)

  revalidatePath(`/vedlikehold/${vendor.taskId}`)
}

// --- TaskProgressEntry actions ---

interface CreateProgressEntryInput {
  taskId: string
  title: string
  description?: string
  dueDate?: Date
  sortOrder?: number
}

export async function createProgressEntry(input: CreateProgressEntryInput) {
  const { context } = await requireHousehold()
  const { taskId, ...fields } = input
  const entry = await addProgressEntry(context, taskId, fields)

  revalidatePath(`/vedlikehold/${taskId}`)
  return entry
}

interface UpdateProgressEntryInput {
  id: string
  title?: string
  description?: string | null
  dueDate?: Date | null
  completed?: boolean
  sortOrder?: number
}

export async function updateProgressEntry(input: UpdateProgressEntryInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const updated = await updateProgressEntryService(context, id, fields)

  revalidatePath(`/vedlikehold/${updated.taskId}`)
  return updated
}

export async function deleteProgressEntry(entryId: string) {
  const { context } = await requireHousehold()
  const entry = await deleteProgressEntryService(context, entryId)

  revalidatePath(`/vedlikehold/${entry.taskId}`)
}

// ─── Bulk Import ────────────────────────────────────────────────

interface BulkMaintenanceImportInput {
  tasks: BulkMaintenanceTaskInput[]
}

export async function bulkImportMaintenanceTasks(
  input: BulkMaintenanceImportInput
) {
  const { context } = await requireHousehold()
  const result = await bulkImportMaintenanceTasksService(context, input.tasks)

  revalidatePath("/vedlikehold")
  return result
}

/**
 * Full replacement stays a server action and is deliberately kept out of the
 * application layer, so no MCP tool can ever reach it (plan 10.4). It applies
 * the same per-task rules as the import service.
 */
export async function replaceMaintenanceTasks(
  input: BulkMaintenanceImportInput
) {
  const { context } = await requireHousehold()
  assertBatchSize(input.tasks.length, "Oppgaver", { allowEmpty: true })

  const data = input.tasks.map((task) =>
    toMaintenanceTaskCreateData(task, context.householdId)
  )

  await db.$transaction(async (tx) => {
    await tx.maintenanceTask.deleteMany({
      where: { householdId: context.householdId },
    })

    for (const task of data) {
      await tx.maintenanceTask.create({ data: task })
    }
  })

  revalidatePath("/vedlikehold")
  return { count: input.tasks.length }
}

// ─── Duplicate Detection ────────────────────────────────────────

export async function findExistingMaintenanceTasks(
  titles: string[]
): Promise<ExistingMaintenanceTask[]> {
  const { context } = await requireHousehold()
  return findExistingMaintenanceTasksService(context, titles)
}

// ─── Bulk Import With Duplicate Handling ────────────────────────

interface BulkMaintenanceImportWithDuplicatesInput {
  newTasks: BulkMaintenanceTaskInput[]
  updates: MaintenanceTaskFieldUpdate[]
}

export async function bulkImportMaintenanceTasksWithDuplicates(
  input: BulkMaintenanceImportWithDuplicatesInput
) {
  const { context } = await requireHousehold()
  const result = await bulkImportMaintenanceTasksWithDuplicatesService(
    context,
    input
  )

  revalidatePath("/vedlikehold")
  return result
}
