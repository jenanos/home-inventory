import { z } from "zod"

import {
  MAX_STEPS_PER_PROJECT,
  MAX_VENDORS_ON_CREATE,
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
} from "../../application/projects/write"
import {
  CREATE_ANNOTATIONS,
  DELETE_ANNOTATIONS,
  defineWriteTool,
  UPDATE_ANNOTATIONS,
  type McpToolDefinition,
} from "./define"
import {
  projectSchema,
  projectStepSchema,
  projectVendorSchema,
  serializeProject,
  serializeProjectStep,
  serializeProjectVendor,
} from "./projects"
import {
  PRIORITIES,
  PROJECT_EXECUTIONS,
  PROJECT_STATUSES,
  PROJECT_TYPES,
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

// ─── Projects ───────────────────────────────────────────────────

const projectFieldsInputSchema = {
  description: longTextInputSchema,
  type: z
    .enum(PROJECT_TYPES)
    .optional()
    .describe(
      "MAINTENANCE (upkeep), REPAIR (fix something broken), RENOVATION (redo a room or surface), IMPROVEMENT (something new or better) or OTHER."
    ),
  execution: z
    .enum(PROJECT_EXECUTIONS)
    .nullable()
    .optional()
    .describe(
      "Who does the work: SELF, VENDOR or MIXED; null when not decided. Vendors are only relevant for VENDOR and MIXED."
    ),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  estimatedDuration: shortTextInputSchema.describe(
    "Free text, e.g. '2 timer' or 'en helg'."
  ),
  estimatedPrice: moneyInputSchema
    .nullable()
    .optional()
    .describe("Expected total cost in NOK, or null."),
  dueDate: calendarDateInputSchema
    .nullable()
    .optional()
    .describe("Due date as YYYY-MM-DD, or null to clear it."),
}

const stepFieldsInputSchema = {
  description: longTextInputSchema,
  dueDate: calendarDateInputSchema
    .nullable()
    .optional()
    .describe("Due date as YYYY-MM-DD, or null to clear it."),
}

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

export const createProjectTool = defineWriteTool({
  name: "create-project",
  scope: "maintenance:write",
  title: "Create a home project",
  description:
    "Adds a project for the household, optionally with its checklist steps and vendor quotes in the same all-or-nothing call. Check list-projects first so the same project is not added twice. Type defaults to OTHER, priority to MEDIUM and status to NOT_STARTED. To buy things for it, create a shopping list with create-shopping-list and projectId. Returns the saved project with its steps and vendors.",
  inputSchema: {
    title: nameInputSchema,
    ...projectFieldsInputSchema,
    steps: z
      .array(z.object({ title: nameInputSchema, ...stepFieldsInputSchema }))
      .max(MAX_STEPS_PER_PROJECT)
      .optional()
      .describe("Checklist steps in the order they should be done."),
    vendors: z
      .array(z.object({ name: nameInputSchema, ...vendorFieldsInputSchema }))
      .max(MAX_VENDORS_ON_CREATE)
      .optional()
      .describe(
        "Vendor quotes, for projects someone is hired for. None is selected."
      ),
  },
  outputSchema: {
    project: projectSchema,
    steps: z.array(projectStepSchema),
    vendors: z.array(projectVendorSchema),
  },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "project",
  handler: async (args, session) => {
    const project = await createProject(session.context, args)
    const { steps, vendors } = project

    return {
      structuredContent: {
        project: serializeProject(project),
        steps: steps.map(serializeProjectStep),
        vendors: vendors.map(serializeProjectVendor),
      },
      summary: `Opprettet prosjektet ${project.title} med ${steps.length} steg og ${vendors.length} leverandør(er).`,
      resourceId: project.id,
    }
  },
})

export const updateProjectTool = defineWriteTool({
  name: "update-project",
  scope: "maintenance:write",
  title: "Update a home project",
  description:
    "Changes the given fields of one project, including its status, type and who does the work, and leaves every omitted field as it is; null clears an optional field. Steps and vendors have their own tools. Returns the saved project.",
  inputSchema: {
    projectId: idSchema.describe("Id from list-projects."),
    title: nameInputSchema.optional(),
    ...projectFieldsInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { project: projectSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "project",
  handler: async (args, session) => {
    const { projectId, expectedUpdatedAt, ...fields } = args
    const project = await updateProject(session.context, projectId, {
      ...fields,
      expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
    })

    return {
      structuredContent: { project: serializeProject(project) },
      summary: `Oppdaterte prosjektet ${project.title} (${project.status}).`,
      resourceId: project.id,
    }
  },
})

export const deleteProjectTool = defineWriteTool({
  name: "delete-project",
  scope: "maintenance:write",
  title: "Delete a home project",
  description:
    "Permanently deletes one project with its steps and vendors. Linked shopping lists are kept but no longer belong to a project. Prefer status COMPLETED or ON_HOLD for finished or paused work; delete only mistakes and duplicates, and confirm with the user first.",
  inputSchema: {
    projectId: idSchema.describe("Id from list-projects."),
  },
  outputSchema: { deletedProjectId: z.string() },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "project",
  handler: async (args, session) => {
    const project = await deleteProject(session.context, args.projectId)

    return {
      structuredContent: { deletedProjectId: project.id },
      summary: `Slettet prosjektet ${project.title}.`,
      resourceId: project.id,
    }
  },
})

// ─── Steps ──────────────────────────────────────────────────────

const sortOrderInputSchema = z
  .number()
  .int()
  .min(0)
  .max(1_000_000)
  .optional()
  .describe("Position in the checklist, lowest first.")

export const addProjectStepTool = defineWriteTool({
  name: "add-project-step",
  scope: "maintenance:write",
  title: "Add a step to a project",
  description:
    "Adds a checklist step to one project. Without sortOrder it is appended after the last step. Returns the saved step.",
  inputSchema: {
    projectId: idSchema.describe("Id from list-projects."),
    title: nameInputSchema,
    ...stepFieldsInputSchema,
    sortOrder: sortOrderInputSchema,
  },
  outputSchema: { projectId: z.string(), step: projectStepSchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "project_step",
  handler: async (args, session) => {
    const { projectId, ...fields } = args
    const step = await addProjectStep(session.context, projectId, fields)

    return {
      structuredContent: {
        projectId: step.projectId,
        step: serializeProjectStep(step),
      },
      summary: `La til steget ${step.title}.`,
      resourceId: step.id,
    }
  },
})

export const updateProjectStepTool = defineWriteTool({
  name: "update-project-step",
  scope: "maintenance:write",
  title: "Update or complete a project step",
  description:
    "Changes the given fields of one checklist step and leaves every omitted field as it is. Set completed true or false to mark it done or reopen it; this is an end state, not a toggle, and completedAt keeps the time it was first completed. Returns the saved step.",
  inputSchema: {
    stepId: idSchema.describe("Step id from get-project."),
    title: nameInputSchema.optional(),
    ...stepFieldsInputSchema,
    sortOrder: sortOrderInputSchema,
    completed: z.boolean().optional(),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { projectId: z.string(), step: projectStepSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "project_step",
  handler: async (args, session) => {
    const { stepId, expectedUpdatedAt, ...fields } = args
    const step = await updateProjectStep(session.context, stepId, {
      ...fields,
      expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
    })

    return {
      structuredContent: {
        projectId: step.projectId,
        step: serializeProjectStep(step),
      },
      summary: `Oppdaterte steget ${step.title}${step.completed ? " (fullført)" : ""}.`,
      resourceId: step.id,
    }
  },
})

export const reorderProjectStepsTool = defineWriteTool({
  name: "reorder-project-steps",
  scope: "maintenance:write",
  title: "Reorder a project's steps",
  description:
    "Sets the full order of one project's checklist. stepIds must contain exactly the project's step ids from get-project, each once, first step first. Repeating the call changes nothing. Returns the steps in their new order.",
  inputSchema: {
    projectId: idSchema.describe("Id from list-projects."),
    stepIds: z.array(idSchema).max(MAX_STEPS_PER_PROJECT),
  },
  outputSchema: { projectId: z.string(), steps: z.array(projectStepSchema) },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "project",
  handler: async (args, session) => {
    const steps = await reorderProjectSteps(
      session.context,
      args.projectId,
      args.stepIds
    )

    return {
      structuredContent: {
        projectId: args.projectId,
        steps: steps.map(serializeProjectStep),
      },
      summary: `Endret rekkefølgen på ${steps.length} steg.`,
      resourceId: args.projectId,
    }
  },
})

export const deleteProjectStepTool = defineWriteTool({
  name: "delete-project-step",
  scope: "maintenance:write",
  title: "Delete a project step",
  description:
    "Permanently deletes one checklist step. To mark it done, use update-project-step with completed true instead. Confirm with the user first.",
  inputSchema: {
    stepId: idSchema.describe("Step id from get-project."),
  },
  outputSchema: { projectId: z.string(), deletedStepId: z.string() },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "project_step",
  handler: async (args, session) => {
    const step = await deleteProjectStep(session.context, args.stepId)

    return {
      structuredContent: { projectId: step.projectId, deletedStepId: step.id },
      summary: `Slettet steget ${step.title}.`,
      resourceId: step.id,
    }
  },
})

// ─── Vendors ────────────────────────────────────────────────────

export const addProjectVendorTool = defineWriteTool({
  name: "add-project-vendor",
  scope: "maintenance:write",
  title: "Add a vendor quote to a project",
  description:
    "Adds a vendor (a company or craftsperson with an optional quote) to one project. Only relevant when someone is hired; projects the household does itself need none. It is not selected; use set-selected-project-vendor to choose it. Returns the saved vendor.",
  inputSchema: {
    projectId: idSchema.describe("Id from list-projects."),
    name: nameInputSchema,
    ...vendorFieldsInputSchema,
  },
  outputSchema: { projectId: z.string(), vendor: projectVendorSchema },
  annotations: CREATE_ANNOTATIONS,
  resourceType: "project_vendor",
  handler: async (args, session) => {
    const { projectId, ...fields } = args
    const vendor = await addProjectVendor(session.context, projectId, fields)

    return {
      structuredContent: {
        projectId: vendor.projectId,
        vendor: serializeProjectVendor(vendor),
      },
      summary: `La til leverandøren ${vendor.name}.`,
      resourceId: vendor.id,
    }
  },
})

export const updateProjectVendorTool = defineWriteTool({
  name: "update-project-vendor",
  scope: "maintenance:write",
  title: "Update a vendor quote",
  description:
    "Changes the given fields of one vendor and leaves every omitted field as it is; null clears an optional field. It does not change which vendor is selected; use set-selected-project-vendor for that. Returns the saved vendor.",
  inputSchema: {
    vendorId: idSchema.describe("Vendor id from get-project."),
    name: nameInputSchema.optional(),
    ...vendorFieldsInputSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  },
  outputSchema: { projectId: z.string(), vendor: projectVendorSchema },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "project_vendor",
  handler: async (args, session) => {
    const { vendorId, expectedUpdatedAt, ...fields } = args
    const vendor = await updateProjectVendor(session.context, vendorId, {
      ...fields,
      expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
    })

    return {
      structuredContent: {
        projectId: vendor.projectId,
        vendor: serializeProjectVendor(vendor),
      },
      summary: `Oppdaterte leverandøren ${vendor.name}.`,
      resourceId: vendor.id,
    }
  },
})

export const setSelectedProjectVendorTool = defineWriteTool({
  name: "set-selected-project-vendor",
  scope: "maintenance:write",
  title: "Choose the vendor for a project",
  description:
    "Sets which vendor is chosen for a project; at most one vendor per project is selected. Pass vendorId null to clear the choice. Sets an end state, so repeating the call changes nothing. Returns all vendors of the project.",
  inputSchema: {
    projectId: idSchema.describe("Id from list-projects."),
    vendorId: idSchema
      .nullable()
      .describe(
        "Vendor id from get-project, belonging to this project; null clears the selection."
      ),
  },
  outputSchema: {
    projectId: z.string(),
    selectedVendorId: z.string().nullable(),
    vendors: z.array(projectVendorSchema),
  },
  annotations: UPDATE_ANNOTATIONS,
  resourceType: "project",
  handler: async (args, session) => {
    const vendors = await setSelectedVendor(
      session.context,
      args.projectId,
      args.vendorId
    )
    const selected = vendors.find((vendor) => vendor.isSelected) ?? null

    return {
      structuredContent: {
        projectId: args.projectId,
        selectedVendorId: selected?.id ?? null,
        vendors: vendors.map(serializeProjectVendor),
      },
      summary: selected
        ? `Valgte leverandøren ${selected.name}.`
        : "Fjernet valgt leverandør.",
      resourceId: args.projectId,
    }
  },
})

export const deleteProjectVendorTool = defineWriteTool({
  name: "delete-project-vendor",
  scope: "maintenance:write",
  title: "Delete a vendor quote",
  description:
    "Permanently deletes one vendor from a project, for example a quote that was declined or added by mistake. Confirm with the user first.",
  inputSchema: {
    vendorId: idSchema.describe("Vendor id from get-project."),
  },
  outputSchema: { projectId: z.string(), deletedVendorId: z.string() },
  annotations: DELETE_ANNOTATIONS,
  resourceType: "project_vendor",
  handler: async (args, session) => {
    const vendor = await deleteProjectVendor(session.context, args.vendorId)

    return {
      structuredContent: {
        projectId: vendor.projectId,
        deletedVendorId: vendor.id,
      },
      summary: `Slettet leverandøren ${vendor.name}.`,
      resourceId: vendor.id,
    }
  },
})

export const projectWriteTools: McpToolDefinition[] = [
  createProjectTool,
  updateProjectTool,
  deleteProjectTool,
  addProjectStepTool,
  updateProjectStepTool,
  reorderProjectStepsTool,
  deleteProjectStepTool,
  addProjectVendorTool,
  updateProjectVendorTool,
  setSelectedProjectVendorTool,
  deleteProjectVendorTool,
]
