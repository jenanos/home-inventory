import { z } from "zod"

import {
  addProgressEntry,
  addTaskVendor,
  createMaintenanceTask,
  setSelectedVendor,
  updateMaintenanceTask,
  updateProgressEntry,
  updateTaskVendor,
} from "../../application/maintenance/write"
import {
  CREATE_ANNOTATIONS,
  defineWriteTool,
  UPDATE_ANNOTATIONS,
  type McpToolDefinition,
} from "./define"
import {
  maintenanceTaskSchema,
  progressEntrySchema,
  serializeMaintenanceTask,
  serializeProgressEntry,
  serializeTaskVendor,
  taskVendorSchema,
} from "./maintenance"
import {
  PRIORITIES,
  TASK_STATUSES,
  calendarDateInputSchema,
  expectedUpdatedAtSchema,
  idSchema,
  longTextInputSchema,
  moneyInputSchema,
  nameInputSchema,
  parseExpectedUpdatedAt,
  shortTextInputSchema,
  urlInputSchema,
} from "./shared"

// ─── Tasks ──────────────────────────────────────────────────────

const taskFieldsInputSchema = {
  description: longTextInputSchema,
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  estimatedDuration: shortTextInputSchema.describe(
    "Free text, e.g. '2 timer' or 'en helg'."
  ),
  estimatedPrice: moneyInputSchema.nullable().optional(),
  dueDate: calendarDateInputSchema
    .nullable()
    .optional()
    .describe("Due date as YYYY-MM-DD, or null to clear it."),
}

export const createMaintenanceTaskTool = defineWriteTool({
  name: "create-maintenance-task",
  scope: "maintenance:write",
  title: "Create a maintenance task",
  description:
    "Adds a maintenance task for the household. Check list-maintenance-tasks first so the same task is not added twice. Priority defaults to MEDIUM and status to NOT_STARTED. Returns the saved task.",
  inputSchema: {
    title: nameInputSchema,
    ...taskFieldsInputSchema,
  },
  outputSchema: { task: maintenanceTaskSchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "maintenance_task",
  handler: async (args, session) => {
    const task = await createMaintenanceTask(session.context, args)

    return {
      structuredContent: { task: serializeMaintenanceTask(task) },
      summary: `Opprettet vedlikeholdsoppgaven ${task.title}.`,
      resourceId: task.id,
    }
  },
})

export const updateMaintenanceTaskTool = defineWriteTool({
  name: "update-maintenance-task",
  scope: "maintenance:write",
  title: "Update a maintenance task",
  description:
    "Changes the given fields of one maintenance task, including its status, and leaves every omitted field as it is; null clears an optional field. Vendors and progress entries have their own tools. Returns the saved task.",
  inputSchema: {
    taskId: idSchema.describe("Id from list-maintenance-tasks."),
    title: nameInputSchema.optional(),
    ...taskFieldsInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { task: maintenanceTaskSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "maintenance_task",
  handler: async (args, session) => {
    const { taskId, expectedUpdatedAt, ...fields } = args
    const task = await updateMaintenanceTask(session.context, taskId, {
      ...fields,
      expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
    })

    return {
      structuredContent: { task: serializeMaintenanceTask(task) },
      summary: `Oppdaterte vedlikeholdsoppgaven ${task.title} (${task.status}).`,
      resourceId: task.id,
    }
  },
})

// ─── Vendors ────────────────────────────────────────────────────

const vendorFieldsInputSchema = {
  description: longTextInputSchema,
  phone: shortTextInputSchema,
  email: shortTextInputSchema,
  website: urlInputSchema,
  estimatedPrice: moneyInputSchema
    .nullable()
    .optional()
    .describe("The vendor's quoted price in NOK."),
  notes: longTextInputSchema,
}

export const addTaskVendorTool = defineWriteTool({
  name: "add-task-vendor",
  scope: "maintenance:write",
  title: "Add a vendor quote to a maintenance task",
  description:
    "Adds a vendor (a company or craftsperson with an optional quote) to one maintenance task. It is not selected; use set-selected-vendor to choose it. Returns the saved vendor.",
  inputSchema: {
    taskId: idSchema.describe("Id from list-maintenance-tasks."),
    name: nameInputSchema,
    ...vendorFieldsInputSchema,
  },
  outputSchema: { taskId: z.string(), vendor: taskVendorSchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "task_vendor",
  handler: async (args, session) => {
    const { taskId, ...fields } = args
    const vendor = await addTaskVendor(session.context, taskId, fields)

    return {
      structuredContent: {
        taskId: vendor.taskId,
        vendor: serializeTaskVendor(vendor),
      },
      summary: `La til leverandøren ${vendor.name}.`,
      resourceId: vendor.id,
    }
  },
})

export const updateTaskVendorTool = defineWriteTool({
  name: "update-task-vendor",
  scope: "maintenance:write",
  title: "Update a vendor quote",
  description:
    "Changes the given fields of one vendor and leaves every omitted field as it is; null clears an optional field. It does not change which vendor is selected; use set-selected-vendor for that. Returns the saved vendor.",
  inputSchema: {
    vendorId: idSchema.describe("Vendor id from get-maintenance-task."),
    name: nameInputSchema.optional(),
    ...vendorFieldsInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { taskId: z.string(), vendor: taskVendorSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "task_vendor",
  handler: async (args, session) => {
    const { vendorId, expectedUpdatedAt, ...fields } = args
    const vendor = await updateTaskVendor(session.context, vendorId, {
      ...fields,
      expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
    })

    return {
      structuredContent: {
        taskId: vendor.taskId,
        vendor: serializeTaskVendor(vendor),
      },
      summary: `Oppdaterte leverandøren ${vendor.name}.`,
      resourceId: vendor.id,
    }
  },
})

export const setSelectedVendorTool = defineWriteTool({
  name: "set-selected-vendor",
  scope: "maintenance:write",
  title: "Choose the vendor for a maintenance task",
  description:
    "Sets which vendor is chosen for a maintenance task; at most one vendor per task is selected. Pass vendorId null to clear the choice. Sets an end state, so repeating the call changes nothing. Returns all vendors of the task.",
  inputSchema: {
    taskId: idSchema.describe("Id from list-maintenance-tasks."),
    vendorId: idSchema
      .nullable()
      .describe(
        "Vendor id from get-maintenance-task, belonging to this task; null clears the selection."
      ),
  },
  outputSchema: {
    taskId: z.string(),
    selectedVendorId: z.string().nullable(),
    vendors: z.array(taskVendorSchema),
  },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "maintenance_task",
  handler: async (args, session) => {
    const vendors = await setSelectedVendor(
      session.context,
      args.taskId,
      args.vendorId
    )
    const selected = vendors.find((vendor) => vendor.isSelected) ?? null

    return {
      structuredContent: {
        taskId: args.taskId,
        selectedVendorId: selected?.id ?? null,
        vendors: vendors.map(serializeTaskVendor),
      },
      summary: selected
        ? `Valgte leverandøren ${selected.name}.`
        : "Fjernet valgt leverandør.",
      resourceId: args.taskId,
    }
  },
})

// ─── Progress entries ───────────────────────────────────────────

const progressFieldsInputSchema = {
  description: longTextInputSchema,
  dueDate: calendarDateInputSchema
    .nullable()
    .optional()
    .describe("Due date as YYYY-MM-DD, or null to clear it."),
  sortOrder: z
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .optional()
    .describe("Position in the task's checklist, lowest first."),
}

export const addProgressEntryTool = defineWriteTool({
  name: "add-progress-entry",
  scope: "maintenance:write",
  title: "Add a progress entry to a maintenance task",
  description:
    "Adds a checklist step to one maintenance task. Without sortOrder it is appended after the last step. Returns the saved entry.",
  inputSchema: {
    taskId: idSchema.describe("Id from list-maintenance-tasks."),
    title: nameInputSchema,
    ...progressFieldsInputSchema,
  },
  outputSchema: { taskId: z.string(), progressEntry: progressEntrySchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "task_progress_entry",
  handler: async (args, session) => {
    const { taskId, ...fields } = args
    const entry = await addProgressEntry(session.context, taskId, fields)

    return {
      structuredContent: {
        taskId: entry.taskId,
        progressEntry: serializeProgressEntry(entry),
      },
      summary: `La til fremdriftspunktet ${entry.title}.`,
      resourceId: entry.id,
    }
  },
})

export const updateProgressEntryTool = defineWriteTool({
  name: "update-progress-entry",
  scope: "maintenance:write",
  title: "Update or complete a progress entry",
  description:
    "Changes the given fields of one checklist step and leaves every omitted field as it is. Set completed true or false to mark it done or reopen it; this is an end state, not a toggle, and completedAt keeps the time it was first completed. Returns the saved entry.",
  inputSchema: {
    entryId: idSchema.describe("Progress entry id from get-maintenance-task."),
    title: nameInputSchema.optional(),
    ...progressFieldsInputSchema,
    completed: z.boolean().optional(),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { taskId: z.string(), progressEntry: progressEntrySchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "task_progress_entry",
  handler: async (args, session) => {
    const { entryId, expectedUpdatedAt, ...fields } = args
    const entry = await updateProgressEntry(session.context, entryId, {
      ...fields,
      expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
    })

    return {
      structuredContent: {
        taskId: entry.taskId,
        progressEntry: serializeProgressEntry(entry),
      },
      summary: `Oppdaterte fremdriftspunktet ${entry.title}${entry.completed ? " (fullført)" : ""}.`,
      resourceId: entry.id,
    }
  },
})

export const maintenanceWriteTools: McpToolDefinition[] = [
  createMaintenanceTaskTool,
  updateMaintenanceTaskTool,
  addTaskVendorTool,
  updateTaskVendorTool,
  setSelectedVendorTool,
  addProgressEntryTool,
  updateProgressEntryTool,
]
