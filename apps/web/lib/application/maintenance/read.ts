import { db } from "@workspace/db"

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
