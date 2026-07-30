import type { ApplicationContext } from "@/lib/application/context"
import {
  getMaintenanceTask as readMaintenanceTask,
  listMaintenanceTasks,
} from "@/lib/application/maintenance/read"

export async function getMaintenanceTasks(context: ApplicationContext) {
  return listMaintenanceTasks(context)
}

export async function getMaintenanceTask(
  context: ApplicationContext,
  taskId: string
) {
  return readMaintenanceTask(context, taskId)
}
