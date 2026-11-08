import {
  db,
  Priority,
  ProjectExecution,
  ProjectStatus,
  ProjectType,
  type Prisma,
} from "@workspace/db"

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

/**
 * Project write services, shared by the web actions and the MCP tools.
 *
 * Children (vendors and steps) are bounded through their parent project, which
 * is bounded by the household. Every write puts that filter in its own
 * `where`, so a child id from another household simply does not match.
 */

const PROJECT = "prosjekt"
const VENDOR = "leverandør"
const STEP = "steg"

const PRIORITY_VALUES = Object.values(Priority)
const STATUS_VALUES = Object.values(ProjectStatus)
const TYPE_VALUES = Object.values(ProjectType)
const EXECUTION_VALUES = Object.values(ProjectExecution)

const MAX_SORT_ORDER = 1_000_000
const MAX_CONTACT_LENGTH = 320

/** A checklist is a plan, not a backlog. Shared by create and reorder. */
export const MAX_STEPS_PER_PROJECT = 100
/** Inline vendors on create are a handful of quotes. */
export const MAX_VENDORS_ON_CREATE = 20

type Tx = Prisma.TransactionClient

function projectInHousehold(context: ApplicationContext) {
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

function nullableEnum<T extends string>(
  value: T | null | undefined,
  allowed: readonly T[],
  field: string
): T | null | undefined {
  if (value == null) return value
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

// ─── Projects ───────────────────────────────────────────────────

export type ProjectFields = {
  title: string
  description?: string | null
  type?: ProjectType
  /** Who does the work. `null` means not decided. */
  execution?: ProjectExecution | null
  priority?: Priority
  status?: ProjectStatus
  estimatedDuration?: string | null
  estimatedPrice?: number | null
  /** Calendar date: a `Date` from the web flow or `YYYY-MM-DD` from MCP. */
  dueDate?: Date | string | null
}

export type NewProject = ProjectFields & {
  /** Checklist steps in order. */
  steps?: Array<Omit<ProjectStepFields, "sortOrder">>
  /** Vendor quotes; none is selected. */
  vendors?: ProjectVendorFields[]
}

export type UpdateProjectInput = Partial<ProjectFields> & {
  /** Rejects the write with CONFLICT if the project changed since it was read. */
  expectedUpdatedAt?: Date
}

function normalizeProjectFields(input: Partial<ProjectFields>) {
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
    type: optionalEnum(input.type, TYPE_VALUES, "Type"),
    execution: nullableEnum(input.execution, EXECUTION_VALUES, "Utførelse"),
    priority: optionalEnum(input.priority, PRIORITY_VALUES, "Prioritet"),
    status: optionalEnum(input.status, STATUS_VALUES, "Status"),
    estimatedDuration: optionalText(input.estimatedDuration, "Estimert tid"),
    estimatedPrice: optionalMoneyAmount(input.estimatedPrice, "Estimert pris"),
    dueDate: optionalCalendarDate(input.dueDate, "Frist"),
  })
}

/**
 * Creates a project, optionally with its checklist and vendor quotes in the
 * same transaction, so an assistant can lay out a whole project in one call.
 * Every child is validated before anything is written.
 */
export async function createProject(
  context: ApplicationContext,
  input: NewProject
) {
  const fields = normalizeProjectFields(input)
  const steps = input.steps ?? []
  const vendors = input.vendors ?? []

  if (steps.length > MAX_STEPS_PER_PROJECT) {
    throw validationError(
      `Et prosjekt kan ha maks ${MAX_STEPS_PER_PROJECT} steg.`
    )
  }
  if (vendors.length > MAX_VENDORS_ON_CREATE) {
    throw validationError(
      `Maks ${MAX_VENDORS_ON_CREATE} leverandører kan legges til når prosjektet opprettes.`
    )
  }

  const stepData = steps.map((step, index) => ({
    ...normalizeStepFields(step),
    title: requiredText(step.title, "Stegtittel"),
    sortOrder: index,
  }))
  const vendorData = vendors.map((vendor) => ({
    ...normalizeVendorFields(vendor),
    name: requiredText(vendor.name, "Leverandørnavn"),
  }))

  return db.project.create({
    data: {
      ...fields,
      title: requiredText(input.title, "Tittel"),
      householdId: context.householdId,
      ...(stepData.length > 0 ? { steps: { create: stepData } } : {}),
      ...(vendorData.length > 0 ? { vendors: { create: vendorData } } : {}),
    },
    include: {
      steps: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      vendors: { orderBy: [{ name: "asc" }, { id: "asc" }] },
    },
  })
}

export async function updateProject(
  context: ApplicationContext,
  projectId: string,
  input: UpdateProjectInput
) {
  const { expectedUpdatedAt, ...rest } = input
  const fields = normalizeProjectFields(rest)
  const scope = { id: projectId, ...projectInHousehold(context) }

  return scopedWrite({
    resource: PROJECT,
    expectedUpdatedAt,
    write: () =>
      db.project.update({
        where: { ...scope, ...freshness(expectedUpdatedAt) },
        data: fields,
      }),
    existsInScope: async () => (await db.project.count({ where: scope })) > 0,
  })
}

/**
 * Removes the project with its vendors and steps. Linked shopping lists are
 * kept and simply no longer point at a project (`onDelete: SetNull`).
 */
export async function deleteProject(
  context: ApplicationContext,
  projectId: string
) {
  return scopedWrite({
    resource: PROJECT,
    write: () =>
      db.project.delete({
        where: { id: projectId, ...projectInHousehold(context) },
      }),
  })
}

// ─── Vendors ────────────────────────────────────────────────────

export type ProjectVendorFields = {
  name: string
  description?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  estimatedPrice?: number | null
  notes?: string | null
}

export type UpdateProjectVendorInput = Partial<ProjectVendorFields> & {
  expectedUpdatedAt?: Date
}

/**
 * `isSelected` is deliberately not a vendor field: choosing a vendor changes
 * the other vendors of the project too, so it is its own operation
 * (`setSelectedVendor`).
 */
function normalizeVendorFields(input: Partial<ProjectVendorFields>) {
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

export async function addProjectVendor(
  context: ApplicationContext,
  projectId: string,
  input: ProjectVendorFields
) {
  const fields = normalizeVendorFields(input)

  // The parent is connected through a household-bounded unique filter, so a
  // project id from another household fails the insert itself.
  return scopedWrite({
    resource: PROJECT,
    write: () =>
      db.projectVendor.create({
        data: {
          ...fields,
          name: requiredText(input.name, "Navn"),
          project: {
            connect: { id: projectId, ...projectInHousehold(context) },
          },
        },
      }),
  })
}

export async function updateProjectVendor(
  context: ApplicationContext,
  vendorId: string,
  input: UpdateProjectVendorInput
) {
  const { expectedUpdatedAt, ...rest } = input
  const fields = normalizeVendorFields(rest)
  const scope = { id: vendorId, project: projectInHousehold(context) }

  return scopedWrite({
    resource: VENDOR,
    expectedUpdatedAt,
    write: () =>
      db.projectVendor.update({
        where: { ...scope, ...freshness(expectedUpdatedAt) },
        data: fields,
      }),
    existsInScope: async () =>
      (await db.projectVendor.count({ where: scope })) > 0,
  })
}

export async function deleteProjectVendor(
  context: ApplicationContext,
  vendorId: string
) {
  return scopedWrite({
    resource: VENDOR,
    write: () =>
      db.projectVendor.delete({
        where: { id: vendorId, project: projectInHousehold(context) },
      }),
  })
}

/**
 * Sets which vendor is chosen for a project: an explicit end state, so
 * repeating the call changes nothing (plan 9.2). `null` clears the selection.
 * The vendor must belong to this project; a vendor from another project is
 * NOT_FOUND, exactly like an unknown id.
 */
export async function setSelectedVendor(
  context: ApplicationContext,
  projectId: string,
  vendorId: string | null
) {
  return scopedWrite({
    resource: VENDOR,
    write: () =>
      db.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: projectId, ...projectInHousehold(context) },
          select: { id: true },
        })
        if (!project) {
          throw notFound(PROJECT)
        }

        const vendorScope = { projectId, project: projectInHousehold(context) }

        await tx.projectVendor.updateMany({
          where: {
            ...vendorScope,
            isSelected: true,
            ...(vendorId ? { NOT: { id: vendorId } } : {}),
          },
          data: { isSelected: false },
        })

        if (vendorId) {
          // P2025 when the vendor is not on this project; the transaction then
          // rolls back the clearing above as well.
          await tx.projectVendor.update({
            where: { id: vendorId, ...vendorScope },
            data: { isSelected: true },
          })
        }

        return tx.projectVendor.findMany({
          where: vendorScope,
          orderBy: [{ isSelected: "desc" }, { name: "asc" }, { id: "asc" }],
        })
      }),
  })
}

// ─── Steps ──────────────────────────────────────────────────────

export type ProjectStepFields = {
  title: string
  description?: string | null
  /** Calendar date: a `Date` from the web flow or `YYYY-MM-DD` from MCP. */
  dueDate?: Date | string | null
  /** Omitted on create: the step is appended after the last one. */
  sortOrder?: number
}

export type UpdateProjectStepInput = Partial<ProjectStepFields> & {
  /** End state, not a toggle: repeating `completed: true` changes nothing. */
  completed?: boolean
  expectedUpdatedAt?: Date
}

function normalizeStepFields(input: Partial<ProjectStepFields>) {
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

export async function addProjectStep(
  context: ApplicationContext,
  projectId: string,
  input: ProjectStepFields
) {
  const fields = normalizeStepFields(input)

  let sortOrder = fields.sortOrder
  if (sortOrder === undefined) {
    const last = await db.projectStep.aggregate({
      where: { projectId, project: projectInHousehold(context) },
      _max: { sortOrder: true },
    })
    sortOrder = last._max.sortOrder === null ? 0 : last._max.sortOrder + 1
  }

  return scopedWrite({
    resource: PROJECT,
    write: () =>
      db.projectStep.create({
        data: {
          ...fields,
          title: requiredText(input.title, "Tittel"),
          sortOrder,
          project: {
            connect: { id: projectId, ...projectInHousehold(context) },
          },
        },
      }),
  })
}

/**
 * `completedAt` records when the step was first completed: it is set on the
 * transition to completed, kept when the step is already completed, and
 * cleared when it is reopened.
 */
export async function updateProjectStep(
  context: ApplicationContext,
  stepId: string,
  input: UpdateProjectStepInput,
  now: () => Date = () => new Date()
) {
  const { expectedUpdatedAt, completed, ...rest } = input
  const fields = normalizeStepFields(rest)
  optionalBoolean(completed, "Fullført")
  const scope = { id: stepId, project: projectInHousehold(context) }

  const completion =
    completed === true
      ? { completed: true }
      : completed === false
        ? { completed: false, completedAt: null }
        : {}

  return scopedWrite({
    resource: STEP,
    expectedUpdatedAt,
    write: () =>
      db.$transaction(async (tx) => {
        await tx.projectStep.update({
          where: { ...scope, ...freshness(expectedUpdatedAt) },
          data: { ...fields, ...completion },
        })

        if (completed === true) {
          // Only stamps a step that has no completion time yet, so a retry
          // keeps the original timestamp. Already authorized by the update.
          await tx.projectStep.updateMany({
            where: { id: stepId, completedAt: null },
            data: { completedAt: now() },
          })
        }

        return tx.projectStep.findUniqueOrThrow({
          where: { id: stepId },
        })
      }),
    existsInScope: async () =>
      (await db.projectStep.count({ where: scope })) > 0,
  })
}

export async function deleteProjectStep(
  context: ApplicationContext,
  stepId: string
) {
  return scopedWrite({
    resource: STEP,
    write: () =>
      db.projectStep.delete({
        where: { id: stepId, project: projectInHousehold(context) },
      }),
  })
}

async function stepsOfProject(
  tx: Tx,
  context: ApplicationContext,
  projectId: string
) {
  const project = await tx.project.findFirst({
    where: { id: projectId, ...projectInHousehold(context) },
    select: { steps: { select: { id: true } } },
  })
  if (!project) throw notFound(PROJECT)
  return project.steps.map((step) => step.id)
}

/**
 * Sets the full order of a project's checklist. `stepIds` must be exactly the
 * project's steps, each once, so a stale list is rejected rather than leaving
 * some steps out of order. Repeating the call changes nothing.
 */
export async function reorderProjectSteps(
  context: ApplicationContext,
  projectId: string,
  stepIds: string[]
) {
  if (new Set(stepIds).size !== stepIds.length) {
    throw validationError("Hvert steg kan bare stå én gang.")
  }
  if (stepIds.length > MAX_STEPS_PER_PROJECT) {
    throw validationError(
      `Et prosjekt kan ha maks ${MAX_STEPS_PER_PROJECT} steg.`
    )
  }

  return db.$transaction(async (tx) => {
    const existing = await stepsOfProject(tx, context, projectId)
    const sameSet =
      existing.length === stepIds.length &&
      existing.every((id) => stepIds.includes(id))
    if (!sameSet) {
      throw validationError(
        "Rekkefølgen må inneholde nøyaktig prosjektets steg. Hent prosjektet på nytt og prøv igjen."
      )
    }

    for (const [index, id] of stepIds.entries()) {
      await tx.projectStep.update({
        where: { id, projectId },
        data: { sortOrder: index },
      })
    }

    return tx.projectStep.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    })
  })
}
