import { db, Priority, TaskStatus } from "@workspace/db"

import type { ApplicationContext } from "../context"
import {
  MAX_LONG_TEXT_LENGTH,
  definedFields,
  enumValue,
  freshness,
  integerInRange,
  notFound,
  optionalCalendarDate,
  optionalMoneyAmount,
  optionalText,
  optionalUrl,
  requiredText,
  scopedWrite,
  validationError,
} from "../mutations"

const TASK = "vedlikeholdsoppgave"
const VENDOR = "leverandør"
const PROGRESS_ENTRY = "fremdriftspunkt"

const PRIORITY_VALUES = Object.values(Priority)
const TASK_STATUS_VALUES = Object.values(TaskStatus)

const MAX_SORT_ORDER = 1_000_000
const MAX_CONTACT_LENGTH = 320

/**
 * Children are bounded through their parent task, which is bounded by the
 * household. Every write below puts this filter in its own `where`, so a child
 * id from another household simply does not match.
 */
function taskInHousehold(context: ApplicationContext) {
  return { householdId: context.householdId }
}

function optionalEnum<T extends string>(
  value: T | null | undefined,
  allowed: readonly T[],
  field: string
): T | undefined {
  if (value === undefined) return undefined
  if (value === null) {
    throw validationError(`${field} kan ikke tømmes.`)
  }
  return enumValue(value, allowed, field)
}

function optionalBoolean(value: boolean | undefined, field: string) {
  if (value !== undefined && typeof value !== "boolean") {
    throw validationError(`${field} må være sann eller usann.`)
  }
  return value
}

function optionalSortOrder(value: number | undefined) {
  return value === undefined
    ? undefined
    : integerInRange(value, "Rekkefølge", { min: 0, max: MAX_SORT_ORDER })
}

// ─── Tasks ──────────────────────────────────────────────────────

export type MaintenanceTaskFields = {
  title: string
  description?: string | null
  priority?: Priority
  status?: TaskStatus
  estimatedDuration?: string | null
  estimatedPrice?: number | null
  /** Calendar date: a `Date` from the web flow or `YYYY-MM-DD` from MCP. */
  dueDate?: Date | string | null
}

export type UpdateMaintenanceTaskInput = Partial<MaintenanceTaskFields> & {
  /** Rejects the write with CONFLICT if the task changed since it was read. */
  expectedUpdatedAt?: Date
}

function normalizeTaskFields(input: Partial<MaintenanceTaskFields>) {
  return definedFields({
    title:
      input.title === undefined
        ? undefined
        : requiredText(input.title, "Tittel"),
    description: optionalText(
      input.description,
      "Beskrivelse",
      MAX_LONG_TEXT_LENGTH
    ),
    priority: optionalEnum(input.priority, PRIORITY_VALUES, "Prioritet"),
    status: optionalEnum(input.status, TASK_STATUS_VALUES, "Status"),
    estimatedDuration: optionalText(input.estimatedDuration, "Estimert tid"),
    estimatedPrice: optionalMoneyAmount(input.estimatedPrice, "Estimert pris"),
    dueDate: optionalCalendarDate(input.dueDate, "Frist"),
  })
}

export async function createMaintenanceTask(
  context: ApplicationContext,
  input: MaintenanceTaskFields
) {
  const fields = normalizeTaskFields(input)

  return db.maintenanceTask.create({
    data: {
      ...fields,
      title: requiredText(input.title, "Tittel"),
      householdId: context.householdId,
    },
  })
}

export async function updateMaintenanceTask(
  context: ApplicationContext,
  taskId: string,
  input: UpdateMaintenanceTaskInput
) {
  const { expectedUpdatedAt, ...rest } = input
  const fields = normalizeTaskFields(rest)
  const scope = { id: taskId, ...taskInHousehold(context) }

  return scopedWrite({
    resource: TASK,
    expectedUpdatedAt,
    write: () =>
      db.maintenanceTask.update({
        where: { ...scope, ...freshness(expectedUpdatedAt) },
        data: fields,
      }),
    existsInScope: async () =>
      (await db.maintenanceTask.count({ where: scope })) > 0,
  })
}

export async function deleteMaintenanceTask(
  context: ApplicationContext,
  taskId: string
) {
  return scopedWrite({
    resource: TASK,
    write: () =>
      db.maintenanceTask.delete({
        where: { id: taskId, ...taskInHousehold(context) },
      }),
  })
}

// ─── Vendors ────────────────────────────────────────────────────

export type TaskVendorFields = {
  name: string
  description?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  estimatedPrice?: number | null
  notes?: string | null
}

export type UpdateTaskVendorInput = Partial<TaskVendorFields> & {
  expectedUpdatedAt?: Date
}

/**
 * `isSelected` is deliberately not a vendor field: choosing a vendor changes
 * the other vendors of the task too, so it is its own operation
 * (`setSelectedVendor`).
 */
function normalizeVendorFields(input: Partial<TaskVendorFields>) {
  return definedFields({
    name:
      input.name === undefined ? undefined : requiredText(input.name, "Navn"),
    description: optionalText(
      input.description,
      "Beskrivelse",
      MAX_LONG_TEXT_LENGTH
    ),
    phone: optionalText(input.phone, "Telefon", MAX_CONTACT_LENGTH),
    email: optionalText(input.email, "E-post", MAX_CONTACT_LENGTH),
    website: optionalUrl(input.website, "Nettside"),
    estimatedPrice: optionalMoneyAmount(input.estimatedPrice, "Estimert pris"),
    notes: optionalText(input.notes, "Notater", MAX_LONG_TEXT_LENGTH),
  })
}

export async function addTaskVendor(
  context: ApplicationContext,
  taskId: string,
  input: TaskVendorFields
) {
  const fields = normalizeVendorFields(input)

  // The parent is connected through a household-bounded unique filter, so a
  // task id from another household fails the insert itself.
  return scopedWrite({
    resource: TASK,
    write: () =>
      db.taskVendor.create({
        data: {
          ...fields,
          name: requiredText(input.name, "Navn"),
          task: { connect: { id: taskId, ...taskInHousehold(context) } },
        },
      }),
  })
}

export async function updateTaskVendor(
  context: ApplicationContext,
  vendorId: string,
  input: UpdateTaskVendorInput
) {
  const { expectedUpdatedAt, ...rest } = input
  const fields = normalizeVendorFields(rest)
  const scope = { id: vendorId, task: taskInHousehold(context) }

  return scopedWrite({
    resource: VENDOR,
    expectedUpdatedAt,
    write: () =>
      db.taskVendor.update({
        where: { ...scope, ...freshness(expectedUpdatedAt) },
        data: fields,
      }),
    existsInScope: async () =>
      (await db.taskVendor.count({ where: scope })) > 0,
  })
}

export async function deleteTaskVendor(
  context: ApplicationContext,
  vendorId: string
) {
  return scopedWrite({
    resource: VENDOR,
    write: () =>
      db.taskVendor.delete({
        where: { id: vendorId, task: taskInHousehold(context) },
      }),
  })
}

/**
 * Sets which vendor is chosen for a task: an explicit end state, so repeating
 * the call changes nothing (plan 9.2). `null` clears the selection. The vendor
 * must belong to this task; a vendor from another task is NOT_FOUND, exactly
 * like an unknown id.
 */
export async function setSelectedVendor(
  context: ApplicationContext,
  taskId: string,
  vendorId: string | null
) {
  return scopedWrite({
    resource: VENDOR,
    write: () =>
      db.$transaction(async (tx) => {
        const task = await tx.maintenanceTask.findFirst({
          where: { id: taskId, ...taskInHousehold(context) },
          select: { id: true },
        })
        if (!task) {
          throw notFound(TASK)
        }

        const vendorScope = { taskId, task: taskInHousehold(context) }

        await tx.taskVendor.updateMany({
          where: {
            ...vendorScope,
            isSelected: true,
            ...(vendorId ? { NOT: { id: vendorId } } : {}),
          },
          data: { isSelected: false },
        })

        if (vendorId) {
          // P2025 when the vendor is not on this task; the transaction then
          // rolls back the clearing above as well.
          await tx.taskVendor.update({
            where: { id: vendorId, ...vendorScope },
            data: { isSelected: true },
          })
        }

        return tx.taskVendor.findMany({
          where: vendorScope,
          orderBy: [{ isSelected: "desc" }, { name: "asc" }, { id: "asc" }],
        })
      }),
  })
}

// ─── Progress entries ───────────────────────────────────────────

export type ProgressEntryFields = {
  title: string
  description?: string | null
  /** Calendar date: a `Date` from the web flow or `YYYY-MM-DD` from MCP. */
  dueDate?: Date | string | null
  /** Omitted on create: the entry is appended after the last one. */
  sortOrder?: number
}

export type UpdateProgressEntryInput = Partial<ProgressEntryFields> & {
  /** End state, not a toggle: repeating `completed: true` changes nothing. */
  completed?: boolean
  expectedUpdatedAt?: Date
}

function normalizeProgressFields(input: Partial<ProgressEntryFields>) {
  return definedFields({
    title:
      input.title === undefined
        ? undefined
        : requiredText(input.title, "Tittel"),
    description: optionalText(
      input.description,
      "Beskrivelse",
      MAX_LONG_TEXT_LENGTH
    ),
    dueDate: optionalCalendarDate(input.dueDate, "Frist"),
    sortOrder: optionalSortOrder(input.sortOrder),
  })
}

export async function addProgressEntry(
  context: ApplicationContext,
  taskId: string,
  input: ProgressEntryFields
) {
  const fields = normalizeProgressFields(input)

  let sortOrder = fields.sortOrder
  if (sortOrder === undefined) {
    const last = await db.taskProgressEntry.aggregate({
      where: { taskId, task: taskInHousehold(context) },
      _max: { sortOrder: true },
    })
    sortOrder = last._max.sortOrder === null ? 0 : last._max.sortOrder + 1
  }

  return scopedWrite({
    resource: TASK,
    write: () =>
      db.taskProgressEntry.create({
        data: {
          ...fields,
          title: requiredText(input.title, "Tittel"),
          sortOrder,
          task: { connect: { id: taskId, ...taskInHousehold(context) } },
        },
      }),
  })
}

/**
 * `completedAt` records when the entry was first completed: it is set on the
 * transition to completed, kept when the entry is already completed, and
 * cleared when it is reopened. Before, it was reset on every call.
 */
export async function updateProgressEntry(
  context: ApplicationContext,
  entryId: string,
  input: UpdateProgressEntryInput,
  now: () => Date = () => new Date()
) {
  const { expectedUpdatedAt, completed, ...rest } = input
  const fields = normalizeProgressFields(rest)
  optionalBoolean(completed, "Fullført")
  const scope = { id: entryId, task: taskInHousehold(context) }

  const completion =
    completed === true
      ? { completed: true }
      : completed === false
        ? { completed: false, completedAt: null }
        : {}

  return scopedWrite({
    resource: PROGRESS_ENTRY,
    expectedUpdatedAt,
    write: () =>
      db.$transaction(async (tx) => {
        await tx.taskProgressEntry.update({
          where: { ...scope, ...freshness(expectedUpdatedAt) },
          data: { ...fields, ...completion },
        })

        if (completed === true) {
          // Only stamps an entry that has no completion time yet, so a retry
          // keeps the original timestamp. Already authorized by the update.
          await tx.taskProgressEntry.updateMany({
            where: { id: entryId, completedAt: null },
            data: { completedAt: now() },
          })
        }

        return tx.taskProgressEntry.findUniqueOrThrow({
          where: { id: entryId },
        })
      }),
    existsInScope: async () =>
      (await db.taskProgressEntry.count({ where: scope })) > 0,
  })
}

export async function deleteProgressEntry(
  context: ApplicationContext,
  entryId: string
) {
  return scopedWrite({
    resource: PROGRESS_ENTRY,
    write: () =>
      db.taskProgressEntry.delete({
        where: { id: entryId, task: taskInHousehold(context) },
      }),
  })
}
