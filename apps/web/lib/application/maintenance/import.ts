import { db, Priority, type Prisma } from "@workspace/db"

import type { ApplicationContext } from "../context"
import {
  MAX_LONG_TEXT_LENGTH,
  assertBatchSize,
  lenientUrl,
  notFound,
  optionalMoneyAmount,
  optionalText,
  requiredText,
  scopedWrite,
  validationError,
} from "../mutations"
import { formatDateToIsoDate, parseCalendarDate } from "../serialization"
import { isApplicationError } from "../errors"

/**
 * The LLM import flows for maintenance tasks: pasted JSON, a duplicate preview
 * in the browser, then one of these calls. They share their rules with the
 * write services but stay a separate module, because they take loosely typed
 * import rows rather than one resource.
 */

export type BulkMaintenanceVendorInput = {
  name: string
  description?: string
  phone?: string
  email?: string
  website?: string
  estimatedPrice?: number
  notes?: string
}

export type BulkMaintenanceProgressEntryInput = {
  title: string
  description?: string
}

export type BulkMaintenanceTaskInput = {
  title: string
  description?: string
  priority?: string
  estimatedDuration?: string
  estimatedPrice?: number
  dueDate?: string
  vendors?: BulkMaintenanceVendorInput[]
  progressEntries?: BulkMaintenanceProgressEntryInput[]
}

export type MaintenanceTaskFieldUpdate = {
  id: string
  fields: {
    description?: string
    priority?: string
    estimatedDuration?: string
    estimatedPrice?: number
    dueDate?: string
  }
}

const PRIORITY_VALUES: readonly string[] = Object.values(Priority)

/**
 * Decision for plan 9.1 / phase 7: the old flow silently turned an unknown
 * priority into MEDIUM. The browser preview already uppercases the value and
 * drops anything it does not recognise, so what the user saw in the preview is
 * either a valid priority or none at all. The server therefore accepts the same
 * case-insensitive spelling, uses the column default (MEDIUM) when no priority
 * was given, and rejects any other value — which can only come from a caller
 * that bypassed the preview — instead of guessing.
 */
function importPriority(
  value: string | undefined,
  label: string
): Priority | undefined {
  if (value === undefined || value.trim() === "") return undefined
  const normalized = value.trim().toUpperCase()
  if (PRIORITY_VALUES.includes(normalized)) {
    return normalized as Priority
  }
  throw validationError(
    `${label}: ukjent prioritet «${value}». Bruk HIGH, MEDIUM eller LOW.`
  )
}

/** Calendar dates are parsed by the normative rule, never `new Date(string)`. */
function importDueDate(value: string, label: string): Date {
  try {
    return parseCalendarDate(value.trim(), "Frist")
  } catch (error) {
    if (isApplicationError(error)) {
      throw validationError(`${label}: ${error.message}`)
    }
    throw error
  }
}

function taskLabel(title: string) {
  return `Oppgaven «${title}»`
}

/**
 * Builds the create payload for one imported task. Exported for
 * `replaceMaintenanceTasks`, which stays a server action outside the
 * application layer (plan 10.4) but must apply the same rules.
 */
export function toMaintenanceTaskCreateData(
  task: BulkMaintenanceTaskInput,
  householdId: string
): Prisma.MaintenanceTaskUncheckedCreateInput {
  const title = requiredText(task.title, "Tittel")
  const label = taskLabel(title)
  const vendors = task.vendors ?? []
  const progressEntries = task.progressEntries ?? []

  assertBatchSize(vendors.length, `${label}: leverandører`, {
    allowEmpty: true,
  })
  assertBatchSize(progressEntries.length, `${label}: fremdriftspunkter`, {
    allowEmpty: true,
  })

  return {
    title,
    description:
      optionalText(task.description, "Beskrivelse", MAX_LONG_TEXT_LENGTH) ??
      undefined,
    priority: importPriority(task.priority, label) ?? "MEDIUM",
    estimatedDuration:
      optionalText(task.estimatedDuration, "Estimert tid") ?? undefined,
    estimatedPrice:
      optionalMoneyAmount(task.estimatedPrice, "Estimert pris") ?? undefined,
    dueDate: task.dueDate ? importDueDate(task.dueDate, label) : undefined,
    householdId,
    vendors:
      vendors.length > 0
        ? {
            create: vendors.map((vendor) => ({
              name: requiredText(vendor.name, "Leverandørnavn"),
              description:
                optionalText(
                  vendor.description,
                  "Beskrivelse",
                  MAX_LONG_TEXT_LENGTH
                ) ?? undefined,
              phone: optionalText(vendor.phone, "Telefon") ?? undefined,
              email: optionalText(vendor.email, "E-post") ?? undefined,
              website: lenientUrl(vendor.website),
              estimatedPrice:
                optionalMoneyAmount(vendor.estimatedPrice, "Estimert pris") ??
                undefined,
              notes:
                optionalText(vendor.notes, "Notater", MAX_LONG_TEXT_LENGTH) ??
                undefined,
            })),
          }
        : undefined,
    progressEntries:
      progressEntries.length > 0
        ? {
            create: progressEntries.map((entry, index) => ({
              title: requiredText(entry.title, "Tittel"),
              description:
                optionalText(
                  entry.description,
                  "Beskrivelse",
                  MAX_LONG_TEXT_LENGTH
                ) ?? undefined,
              sortOrder: index,
            })),
          }
        : undefined,
  }
}

export async function bulkImportMaintenanceTasks(
  context: ApplicationContext,
  tasks: BulkMaintenanceTaskInput[]
) {
  assertBatchSize(tasks.length, "Oppgaver")
  // Validate everything before writing anything.
  const data = tasks.map((task) =>
    toMaintenanceTaskCreateData(task, context.householdId)
  )

  const results = await db.$transaction(
    data.map((task) => db.maintenanceTask.create({ data: task }))
  )

  return { count: results.length }
}

export type ExistingMaintenanceTask = {
  id: string
  title: string
  description: string | null
  priority: string
  estimatedDuration: string | null
  estimatedPrice: number | null
  dueDate: string | null
  vendorCount: number
  progressEntryCount: number
}

export async function findExistingMaintenanceTasks(
  context: ApplicationContext,
  titles: string[]
): Promise<ExistingMaintenanceTask[]> {
  assertBatchSize(titles.length, "Titler", { allowEmpty: true })
  const lowerTitles = new Set(titles.map((title) => title.toLowerCase()))

  const existing = await db.maintenanceTask.findMany({
    where: { householdId: context.householdId },
    include: {
      _count: { select: { vendors: true, progressEntries: true } },
    },
  })

  return existing
    .filter((task) => lowerTitles.has(task.title.toLowerCase()))
    .map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      estimatedDuration: task.estimatedDuration,
      estimatedPrice: task.estimatedPrice ? Number(task.estimatedPrice) : null,
      dueDate: task.dueDate ? formatDateToIsoDate(task.dueDate) : null,
      vendorCount: task._count.vendors,
      progressEntryCount: task._count.progressEntries,
    }))
}

function toTaskUpdateData(
  update: MaintenanceTaskFieldUpdate,
  label: string
): Prisma.MaintenanceTaskUpdateInput {
  const { fields } = update
  const data: Prisma.MaintenanceTaskUpdateInput = {}

  if (fields.description !== undefined) {
    data.description =
      optionalText(fields.description, "Beskrivelse", MAX_LONG_TEXT_LENGTH) ??
      undefined
  }
  if (fields.priority !== undefined) {
    const priority = importPriority(fields.priority, label)
    if (priority) data.priority = priority
  }
  if (fields.estimatedDuration !== undefined) {
    data.estimatedDuration =
      optionalText(fields.estimatedDuration, "Estimert tid") ?? undefined
  }
  if (fields.estimatedPrice !== undefined) {
    data.estimatedPrice =
      optionalMoneyAmount(fields.estimatedPrice, "Estimert pris") ?? undefined
  }
  if (fields.dueDate !== undefined) {
    // An empty value selected in the preview clears the date, as before.
    data.dueDate = fields.dueDate ? importDueDate(fields.dueDate, label) : null
  }

  return data
}

/**
 * Creates the new tasks and applies the selected field updates to existing
 * ones, in one transaction: a failed update no longer leaves the new tasks
 * behind as a partial import. Each update is bounded by the household in its
 * own `where`.
 */
export async function bulkImportMaintenanceTasksWithDuplicates(
  context: ApplicationContext,
  input: {
    newTasks: BulkMaintenanceTaskInput[]
    updates: MaintenanceTaskFieldUpdate[]
  }
) {
  assertBatchSize(input.newTasks.length + input.updates.length, "Oppgaver", {
    allowEmpty: true,
  })

  const createData = input.newTasks.map((task) =>
    toMaintenanceTaskCreateData(task, context.householdId)
  )

  // Titles are only used to name the task in a validation message; the
  // authorization is the household filter on each update below.
  const existing = await db.maintenanceTask.findMany({
    where: {
      id: { in: input.updates.map((update) => update.id) },
      householdId: context.householdId,
    },
    select: { id: true, title: true },
  })
  const titles = new Map(existing.map((task) => [task.id, task.title]))

  const updateData = input.updates.map((update) => {
    const title = titles.get(update.id)
    if (!title) {
      throw notFound("vedlikeholdsoppgave")
    }
    return { id: update.id, data: toTaskUpdateData(update, taskLabel(title)) }
  })

  await scopedWrite({
    resource: "vedlikeholdsoppgave",
    write: () =>
      db.$transaction([
        ...createData.map((data) => db.maintenanceTask.create({ data })),
        ...updateData.map(({ id, data }) =>
          db.maintenanceTask.update({
            where: { id, householdId: context.householdId },
            data,
          })
        ),
      ]),
  })

  return { count: createData.length + updateData.length }
}
