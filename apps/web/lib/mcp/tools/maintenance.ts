import { z } from "zod"

import {
  getMaintenanceTaskDetail,
  listMaintenanceTasksPage,
} from "../../application/maintenance/read"
import {
  buildPageInfo,
  pageInfoSchema,
  paginationInputSchema,
  resolvePageRequest,
} from "../pagination"
import { notFoundError, toolSuccess } from "../result"
import { defineTool, READ_ONLY_ANNOTATIONS } from "./define"
import {
  PRIORITIES,
  TASK_STATUSES,
  assertId,
  calendarDate,
  calendarDateOutputSchema,
  calendarDateSchema,
  idSchema,
  money,
  optionalTimestamp,
  parseFilterDate,
  storedMoneySchema,
  timestamp,
  timestampSchema,
} from "./shared"

export const listMaintenanceTasksTool = defineTool({
  name: "list-maintenance-tasks",
  scope: "maintenance:read",
  title: "List maintenance tasks",
  description:
    "Lists the household's maintenance tasks in due-date order, with undated tasks last. Returns a compact row per task; use get-maintenance-task for the description, vendors and progress entries.",
  inputSchema: {
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    dueBefore: calendarDateSchema
      .optional()
      .describe("Only tasks due on or before this date."),
    dueAfter: calendarDateSchema
      .optional()
      .describe("Only tasks due on or after this date."),
    ...paginationInputSchema,
  },
  outputSchema: {
    tasks: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.enum(TASK_STATUSES),
        priority: z.enum(PRIORITIES),
        estimatedDuration: z.string().nullable(),
        estimatedPrice: storedMoneySchema,
        dueDate: calendarDateOutputSchema,
        vendorCount: z.number().int(),
        progressEntryCount: z.number().int(),
        createdAt: timestampSchema,
        updatedAt: timestampSchema,
      })
    ),
    pageInfo: pageInfoSchema,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    const page = resolvePageRequest(args)
    const { totalCount, tasks } = await listMaintenanceTasksPage(
      session.context,
      {
        ...page,
        status: args.status,
        priority: args.priority,
        dueBefore: parseFilterDate(args.dueBefore, "dueBefore"),
        dueAfter: parseFilterDate(args.dueAfter, "dueAfter"),
      }
    )

    const serialized = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      estimatedDuration: task.estimatedDuration,
      estimatedPrice: money(task.estimatedPrice),
      dueDate: calendarDate(task.dueDate),
      vendorCount: task._count.vendors,
      progressEntryCount: task._count.progressEntries,
      createdAt: timestamp(task.createdAt),
      updatedAt: timestamp(task.updatedAt),
    }))

    return toolSuccess(
      {
        tasks: serialized,
        pageInfo: buildPageInfo(page, serialized.length, totalCount),
      },
      `Fant ${totalCount} vedlikeholdsoppgave(r); viser ${serialized.length}.`
    )
  },
})

export const getMaintenanceTaskTool = defineTool({
  name: "get-maintenance-task",
  scope: "maintenance:read",
  title: "Get a maintenance task",
  description:
    "Returns one maintenance task with its vendor quotes and progress entries. Use list-maintenance-tasks to find the id.",
  inputSchema: {
    taskId: idSchema.describe("Id from list-maintenance-tasks."),
  },
  outputSchema: {
    task: z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      status: z.enum(TASK_STATUSES),
      priority: z.enum(PRIORITIES),
      estimatedDuration: z.string().nullable(),
      estimatedPrice: storedMoneySchema,
      dueDate: calendarDateOutputSchema,
      createdAt: timestampSchema,
      updatedAt: timestampSchema,
    }),
    vendors: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        phone: z.string().nullable(),
        email: z.string().nullable(),
        website: z.string().nullable(),
        estimatedPrice: storedMoneySchema,
        notes: z.string().nullable(),
        isSelected: z.boolean(),
      })
    ),
    progressEntries: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        dueDate: calendarDateOutputSchema,
        completed: z.boolean(),
        completedAt: timestampSchema.nullable(),
        sortOrder: z.number().int(),
      })
    ),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    assertId(args.taskId, "taskId")

    const task = await getMaintenanceTaskDetail(session.context, args.taskId)
    if (!task) {
      return notFoundError("vedlikeholdsoppgave")
    }

    return toolSuccess(
      {
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          estimatedDuration: task.estimatedDuration,
          estimatedPrice: money(task.estimatedPrice),
          dueDate: calendarDate(task.dueDate),
          createdAt: timestamp(task.createdAt),
          updatedAt: timestamp(task.updatedAt),
        },
        vendors: task.vendors.map((vendor) => ({
          ...vendor,
          estimatedPrice: money(vendor.estimatedPrice),
        })),
        progressEntries: task.progressEntries.map((entry) => ({
          id: entry.id,
          title: entry.title,
          description: entry.description,
          dueDate: calendarDate(entry.dueDate),
          completed: entry.completed,
          completedAt: optionalTimestamp(entry.completedAt),
          sortOrder: entry.sortOrder,
        })),
      },
      `${task.title} (${task.status}) med ${task.vendors.length} leverandør(er) og ${task.progressEntries.length} fremdriftspunkt(er).`
    )
  },
})

export const maintenanceTools = [
  listMaintenanceTasksTool,
  getMaintenanceTaskTool,
]
