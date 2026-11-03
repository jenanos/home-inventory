import { db, type Priority, type Prisma, type TaskStatus } from "@workspace/db"

import type { ApplicationContext } from "../context"

const maintenanceRelations = {
  vendors: {
    orderBy: [{ isSelected: "desc" as const }, { name: "asc" as const }],
  },
  progressEntries: {
    orderBy: { sortOrder: "asc" as const },
  },
}

export async function listMaintenanceTasks(context: ApplicationContext) {
  return db.maintenanceTask.findMany({
    where: { householdId: context.householdId },
    include: maintenanceRelations,
    orderBy: { createdAt: "desc" },
  })
}

export async function getMaintenanceTask(
  context: ApplicationContext,
  taskId: string
) {
  return db.maintenanceTask.findFirst({
    where: {
      id: taskId,
      householdId: context.householdId,
    },
    include: maintenanceRelations,
  })
}

// ─── Paged reads ────────────────────────────────────────────────

type PageOptions = {
  limit: number
  offset: number
}

export type MaintenanceTaskFilter = {
  status?: TaskStatus
  priority?: Priority
  dueBefore?: Date
  dueAfter?: Date
}

function maintenanceTaskFilter(
  context: ApplicationContext,
  filter: MaintenanceTaskFilter
): Prisma.MaintenanceTaskWhereInput {
  const dueDate =
    filter.dueBefore || filter.dueAfter
      ? {
          ...(filter.dueAfter ? { gte: filter.dueAfter } : {}),
          ...(filter.dueBefore ? { lte: filter.dueBefore } : {}),
        }
      : undefined

  return {
    householdId: context.householdId,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.priority ? { priority: filter.priority } : {}),
    ...(dueDate ? { dueDate } : {}),
  }
}

export async function listMaintenanceTasksPage(
  context: ApplicationContext,
  options: PageOptions & MaintenanceTaskFilter
) {
  const where = maintenanceTaskFilter(context, options)

  const [totalCount, tasks] = await Promise.all([
    db.maintenanceTask.count({ where }),
    db.maintenanceTask.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        estimatedDuration: true,
        estimatedPrice: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { vendors: true, progressEntries: true } },
      },
      // `dueDate` first with nulls last: an undated task is not urgent, but it
      // must still have a stable place in the ordering for paging to work.
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

  return { totalCount, tasks }
}

/**
 * Vendors and progress entries are fetched through the task, which is itself
 * bounded by the household, so a child id cannot bypass the parent check.
 */
export async function getMaintenanceTaskDetail(
  context: ApplicationContext,
  taskId: string
) {
  return db.maintenanceTask.findFirst({
    where: {
      id: taskId,
      householdId: context.householdId,
    },
    select: {
      id: true,
      title: true,
      description: true,
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
      progressEntries: {
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
    },
  })
}
