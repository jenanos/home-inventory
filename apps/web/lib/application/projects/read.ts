import {
  db,
  type Priority,
  type Prisma,
  type ProjectExecution,
  type ProjectStatus,
  type ProjectType,
} from "@workspace/db"

import { getVisibleShoppingListsWhere } from "../../shopping-list-access"
import type { ApplicationContext } from "../context"

/**
 * Linked shopping lists are always filtered by the list visibility rule, so a
 * project never reveals another member's private list.
 */
function visibleProjectLists(context: ApplicationContext) {
  return getVisibleShoppingListsWhere(context.householdId, context.userId)
}

/** Just enough of each linked list to show what is bought and what it costs. */
function projectShoppingListsSelect(context: ApplicationContext) {
  return {
    where: visibleProjectLists(context),
    select: {
      id: true,
      name: true,
      color: true,
      isPrivate: true,
      updatedAt: true,
      items: {
        select: {
          status: true,
          estimatedPrice: true,
          alternatives: {
            select: { price: true },
            orderBy: [{ rank: "asc" as const }, { id: "asc" as const }],
            take: 1,
          },
        },
      },
    },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  } satisfies Prisma.Project$shoppingListsArgs
}

function projectRelations(context: ApplicationContext) {
  return {
    vendors: {
      orderBy: [{ isSelected: "desc" as const }, { name: "asc" as const }],
    },
    steps: {
      orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    },
    shoppingLists: projectShoppingListsSelect(context),
  } satisfies Prisma.ProjectInclude
}

export async function listProjects(context: ApplicationContext) {
  return db.project.findMany({
    where: { householdId: context.householdId },
    include: projectRelations(context),
    orderBy: { createdAt: "desc" },
  })
}

export async function getProject(
  context: ApplicationContext,
  projectId: string
) {
  return db.project.findFirst({
    where: {
      id: projectId,
      householdId: context.householdId,
    },
    include: projectRelations(context),
  })
}

/** Projects a shopping list can be linked to, for pickers in the web flow. */
export async function listProjectOptions(context: ApplicationContext) {
  return db.project.findMany({
    where: { householdId: context.householdId },
    select: { id: true, title: true, status: true },
    orderBy: [{ status: "asc" }, { title: "asc" }],
  })
}

/** Visible lists not linked to any project, for "link an existing list". */
export async function listUnlinkedShoppingLists(context: ApplicationContext) {
  return db.shoppingList.findMany({
    where: { ...visibleProjectLists(context), projectId: null },
    select: { id: true, name: true, isPrivate: true },
    orderBy: { name: "asc" },
  })
}

// ─── Paged reads ────────────────────────────────────────────────

type PageOptions = {
  limit: number
  offset: number
}

export type ProjectFilter = {
  status?: ProjectStatus
  /** Shorthand for every status except COMPLETED. Ignored when `status` is set. */
  activeOnly?: boolean
  type?: ProjectType
  execution?: ProjectExecution
  priority?: Priority
  dueBefore?: Date
  dueAfter?: Date
  /** Case-insensitive match on title or description. */
  query?: string
}

function projectFilter(
  context: ApplicationContext,
  filter: ProjectFilter
): Prisma.ProjectWhereInput {
  const dueDate =
    filter.dueBefore || filter.dueAfter
      ? {
          ...(filter.dueAfter ? { gte: filter.dueAfter } : {}),
          ...(filter.dueBefore ? { lte: filter.dueBefore } : {}),
        }
      : undefined

  const status: Prisma.ProjectWhereInput["status"] = filter.status
    ? filter.status
    : filter.activeOnly
      ? { not: "COMPLETED" }
      : undefined

  return {
    householdId: context.householdId,
    ...(status ? { status } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.execution ? { execution: filter.execution } : {}),
    ...(filter.priority ? { priority: filter.priority } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(filter.query
      ? {
          OR: [
            { title: { contains: filter.query, mode: "insensitive" } },
            { description: { contains: filter.query, mode: "insensitive" } },
          ],
        }
      : {}),
  }
}

export async function listProjectsPage(
  context: ApplicationContext,
  options: PageOptions & ProjectFilter
) {
  const where = projectFilter(context, options)

  const [totalCount, projects] = await Promise.all([
    db.project.count({ where }),
    db.project.findMany({
      where,
      select: {
        id: true,
        title: true,
        type: true,
        execution: true,
        status: true,
        priority: true,
        estimatedDuration: true,
        estimatedPrice: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        steps: { select: { completed: true } },
        _count: {
          select: {
            vendors: true,
            shoppingLists: { where: visibleProjectLists(context) },
          },
        },
      },
      // `dueDate` first with nulls last: an undated project is not urgent, but
      // it must still have a stable place in the ordering for paging to work.
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "asc" },
        { createdAt: "desc" },
        { id: "asc" },
      ],
      skip: options.offset,
      take: options.limit,
    }),
  ])

  return { totalCount, projects }
}

/**
 * Vendors, steps and linked lists are fetched through the project, which is
 * itself bounded by the household, so a child id cannot bypass the parent
 * check.
 */
export async function getProjectDetail(
  context: ApplicationContext,
  projectId: string
) {
  return db.project.findFirst({
    where: {
      id: projectId,
      householdId: context.householdId,
    },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      execution: true,
      status: true,
      priority: true,
      estimatedDuration: true,
      estimatedPrice: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      vendors: {
        select: {
          id: true,
          name: true,
          description: true,
          phone: true,
          email: true,
          website: true,
          estimatedPrice: true,
          notes: true,
          isSelected: true,
          updatedAt: true,
        },
        orderBy: [{ isSelected: "desc" }, { name: "asc" }, { id: "asc" }],
      },
      steps: {
        select: {
          id: true,
          title: true,
          description: true,
          dueDate: true,
          completed: true,
          completedAt: true,
          sortOrder: true,
          updatedAt: true,
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
      shoppingLists: projectShoppingListsSelect(context),
    },
  })
}
