import { z } from "zod"

import {
  getProjectDetail,
  listProjectsPage,
} from "../../application/projects/read"
import { summarizeShoppingList } from "../../project-purchases"
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
  PROJECT_EXECUTIONS,
  PROJECT_SCALES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  assertId,
  calculated,
  calculatedMoneySchema,
  calendarDate,
  calendarDateOutputSchema,
  calendarDateSchema,
  filterTextSchema,
  idSchema,
  money,
  optionalTimestamp,
  parseFilterDate,
  storedMoneySchema,
  timestamp,
  timestampSchema,
} from "./shared"

// ─── Shared resource shapes ─────────────────────────────────────
//
// The whitelisted objects get-project returns. The write tools return the same
// shapes after saving, so a client sees one form per resource.

type DecimalValue = Parameters<typeof money>[0]

const executionSchema = z
  .enum(PROJECT_EXECUTIONS)
  .nullable()
  .describe(
    "Who does the work: SELF (the household), VENDOR (hired), MIXED (both), or null when not decided."
  )

/**
 * Shared by the read and write tools so assistants get one description of
 * each status. ON_HOLD is spelled out because it is the right state for a
 * project nobody is working on but the household wants to keep.
 */
export const projectStatusDescription =
  "NOT_STARTED (planned, not begun), IN_PROGRESS (being worked on), COMPLETED (done) or ON_HOLD (inactive or paused: the household is not working on it now but wants to keep it, e.g. postponed or waiting for money, season or a vendor). Use ON_HOLD rather than deleting a project that is not being pursued right now."

export const projectScaleDescription =
  "How big the project is: ROUTINE for recurring upkeep like cleaning gutters, MAJOR for larger construction jobs like drainage or paving. Independent of type."

const statusSchema = z.enum(PROJECT_STATUSES).describe(projectStatusDescription)

const scaleSchema = z.enum(PROJECT_SCALES).describe(projectScaleDescription)

export const projectSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.enum(PROJECT_TYPES),
  scale: scaleSchema,
  execution: executionSchema,
  status: statusSchema,
  priority: z.enum(PRIORITIES),
  estimatedDuration: z.string().nullable(),
  estimatedPrice: storedMoneySchema,
  dueDate: calendarDateOutputSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export function serializeProject(project: {
  id: string
  title: string
  description: string | null
  type: (typeof PROJECT_TYPES)[number]
  scale: (typeof PROJECT_SCALES)[number]
  execution: (typeof PROJECT_EXECUTIONS)[number] | null
  status: (typeof PROJECT_STATUSES)[number]
  priority: (typeof PRIORITIES)[number]
  estimatedDuration: string | null
  estimatedPrice: DecimalValue
  dueDate: Date | null
  createdAt: Date
  updatedAt: Date
}): z.infer<typeof projectSchema> {
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    type: project.type,
    scale: project.scale,
    execution: project.execution,
    status: project.status,
    priority: project.priority,
    estimatedDuration: project.estimatedDuration,
    estimatedPrice: money(project.estimatedPrice),
    dueDate: calendarDate(project.dueDate),
    createdAt: timestamp(project.createdAt),
    updatedAt: timestamp(project.updatedAt),
  }
}

export const projectVendorSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  estimatedPrice: storedMoneySchema,
  notes: z.string().nullable(),
  isSelected: z.boolean(),
  updatedAt: timestampSchema,
})

export function serializeProjectVendor(vendor: {
  id: string
  name: string
  description: string | null
  phone: string | null
  email: string | null
  website: string | null
  estimatedPrice: DecimalValue
  notes: string | null
  isSelected: boolean
  updatedAt: Date
}): z.infer<typeof projectVendorSchema> {
  return {
    id: vendor.id,
    name: vendor.name,
    description: vendor.description,
    phone: vendor.phone,
    email: vendor.email,
    website: vendor.website,
    estimatedPrice: money(vendor.estimatedPrice),
    notes: vendor.notes,
    isSelected: vendor.isSelected,
    updatedAt: timestamp(vendor.updatedAt),
  }
}

export const projectStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  dueDate: calendarDateOutputSchema,
  completed: z.boolean(),
  completedAt: timestampSchema.nullable(),
  sortOrder: z.number().int(),
  updatedAt: timestampSchema,
})

export function serializeProjectStep(step: {
  id: string
  title: string
  description: string | null
  dueDate: Date | null
  completed: boolean
  completedAt: Date | null
  sortOrder: number
  updatedAt: Date
}): z.infer<typeof projectStepSchema> {
  return {
    id: step.id,
    title: step.title,
    description: step.description,
    dueDate: calendarDate(step.dueDate),
    completed: step.completed,
    completedAt: optionalTimestamp(step.completedAt),
    sortOrder: step.sortOrder,
    updatedAt: timestamp(step.updatedAt),
  }
}

const projectShoppingListSchema = z.object({
  id: z.string(),
  name: z.string(),
  isPrivate: z.boolean(),
  itemCount: z.number().int().describe("Items that are not SKIPPED."),
  pendingCount: z.number().int(),
  purchasedCount: z.number().int(),
  estimatedTotal: calculatedMoneySchema,
  purchasedTotal: calculatedMoneySchema,
})

export const listProjectsTool = defineTool({
  name: "list-projects",
  scope: "maintenance:read",
  title: "List home projects",
  description:
    "Lists the household's projects (maintenance, repairs, renovations, improvements and anything else) in due-date order, with undated projects last. Returns a compact row per project; use get-project for the description, steps, vendors and linked shopping lists.",
  inputSchema: {
    status: statusSchema.optional(),
    activeOnly: z
      .boolean()
      .optional()
      .describe(
        "Only projects that are not COMPLETED (ON_HOLD is included). Ignored with status."
      ),
    type: z.enum(PROJECT_TYPES).optional(),
    scale: scaleSchema
      .optional()
      .describe(
        "Only ROUTINE (recurring upkeep like cleaning gutters) or MAJOR (larger construction jobs like drainage or paving) projects."
      ),
    execution: z.enum(PROJECT_EXECUTIONS).optional(),
    priority: z.enum(PRIORITIES).optional(),
    query: filterTextSchema
      .optional()
      .describe("Case-insensitive match on title or description."),
    dueBefore: calendarDateSchema
      .optional()
      .describe("Only projects due on or before this date."),
    dueAfter: calendarDateSchema
      .optional()
      .describe("Only projects due on or after this date."),
    ...paginationInputSchema,
  },
  outputSchema: {
    projects: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        type: z.enum(PROJECT_TYPES),
        scale: scaleSchema,
        execution: executionSchema,
        status: statusSchema,
        priority: z.enum(PRIORITIES),
        estimatedDuration: z.string().nullable(),
        estimatedPrice: storedMoneySchema,
        dueDate: calendarDateOutputSchema,
        stepCount: z.number().int(),
        completedStepCount: z.number().int(),
        vendorCount: z.number().int(),
        shoppingListCount: z.number().int(),
        createdAt: timestampSchema,
        updatedAt: timestampSchema,
      })
    ),
    pageInfo: pageInfoSchema,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    const page = resolvePageRequest(args)
    const { totalCount, projects } = await listProjectsPage(session.context, {
      ...page,
      status: args.status,
      activeOnly: args.activeOnly,
      type: args.type,
      scale: args.scale,
      execution: args.execution,
      priority: args.priority,
      query: args.query,
      dueBefore: parseFilterDate(args.dueBefore, "dueBefore"),
      dueAfter: parseFilterDate(args.dueAfter, "dueAfter"),
    })

    const serialized = projects.map((project) => ({
      id: project.id,
      title: project.title,
      type: project.type,
      scale: project.scale,
      execution: project.execution,
      status: project.status,
      priority: project.priority,
      estimatedDuration: project.estimatedDuration,
      estimatedPrice: money(project.estimatedPrice),
      dueDate: calendarDate(project.dueDate),
      stepCount: project.steps.length,
      completedStepCount: project.steps.filter((step) => step.completed).length,
      vendorCount: project._count.vendors,
      shoppingListCount: project._count.shoppingLists,
      createdAt: timestamp(project.createdAt),
      updatedAt: timestamp(project.updatedAt),
    }))

    return toolSuccess(
      {
        projects: serialized,
        pageInfo: buildPageInfo(page, serialized.length, totalCount),
      },
      `Fant ${totalCount} prosjekt(er); viser ${serialized.length}.`
    )
  },
})

export const getProjectTool = defineTool({
  name: "get-project",
  scope: "maintenance:read",
  title: "Get a home project",
  description:
    "Returns one project with its checklist steps, vendor quotes and the shopping lists that buy for it (with item counts and totals; read the items with get-shopping-list). Use list-projects to find the id.",
  inputSchema: {
    projectId: idSchema.describe("Id from list-projects."),
  },
  outputSchema: {
    project: projectSchema,
    steps: z.array(projectStepSchema),
    vendors: z.array(projectVendorSchema),
    shoppingLists: z.array(projectShoppingListSchema),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async (args, session) => {
    assertId(args.projectId, "projectId")

    const project = await getProjectDetail(session.context, args.projectId)
    if (!project) {
      return notFoundError("prosjekt")
    }

    const shoppingLists = project.shoppingLists.map((list) => {
      const summary = summarizeShoppingList(list.items)
      return {
        id: list.id,
        name: list.name,
        isPrivate: list.isPrivate,
        itemCount: summary.itemCount,
        pendingCount: summary.pendingCount,
        purchasedCount: summary.purchasedCount,
        estimatedTotal: calculated(summary.estimatedTotal),
        purchasedTotal: calculated(summary.purchasedTotal),
      }
    })
    const completedSteps = project.steps.filter((step) => step.completed)

    return toolSuccess(
      {
        project: serializeProject(project),
        steps: project.steps.map(serializeProjectStep),
        vendors: project.vendors.map(serializeProjectVendor),
        shoppingLists,
      },
      `${project.title} (${project.status}): ${completedSteps.length}/${project.steps.length} steg fullført, ${project.vendors.length} leverandør(er), ${shoppingLists.length} innkjøpsliste(r).`
    )
  },
})

export const projectTools = [listProjectsTool, getProjectTool]
