import { db } from "@workspace/db"

export async function getMaintenanceTasks(householdId: string) {
  return db.maintenanceTask.findMany({
    where: { householdId },
    include: {
      vendors: {
        orderBy: [{ isSelected: "desc" }, { name: "asc" }],
      },
      progressEntries: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getMaintenanceTask(
  taskId: string,
  householdId: string,
) {
  const task = await db.maintenanceTask.findUnique({
    where: { id: taskId },
    include: {
      vendors: {
        orderBy: [{ isSelected: "desc" }, { name: "asc" }],
      },
      progressEntries: {
        orderBy: { sortOrder: "asc" },
      },
    },
  })

  if (!task || task.householdId !== householdId) {
    return null
  }

  return task
}
