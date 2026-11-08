export { calculateBudgetStats } from "./application/budget/calculations"

type ShoppingItemStatus = "PENDING" | "PURCHASED" | "SKIPPED" | string
type ShoppingItemTimeframe = "NOW" | "SOON" | "LATER" | "SOMEDAY" | string

type MaintenanceTaskStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ON_HOLD"
  | string
type MaintenanceTaskPriority = "HIGH" | string

export type ShoppingStatsItemBase = {
  status: ShoppingItemStatus
  estimatedPrice?: unknown
  alternatives: Array<{ price?: unknown }>
  timeframe?: ShoppingItemTimeframe | null
  assignedTo?: { name: string | null } | null
}

export type MaintenanceStatsTaskBase = {
  status: MaintenanceTaskStatus
  priority?: MaintenanceTaskPriority | null
  estimatedPrice?: unknown
  dueDate?: string | Date | null
}

function getEffectivePrice(item: ShoppingStatsItemBase): number {
  if (item.estimatedPrice) return Number(item.estimatedPrice)
  const topAlt = item.alternatives[0]
  return topAlt?.price ? Number(topAlt.price) : 0
}

export function calculateShoppingStats<T extends ShoppingStatsItemBase>(
  items: T[]
) {
  const budgetItems = items.filter((item) => item.status !== "SKIPPED")
  const pendingItems = items.filter((item) => item.status === "PENDING")

  return {
    totalItems: items.length,
    pendingCount: pendingItems.length,
    purchasedCount: items.filter((item) => item.status === "PURCHASED").length,
    totalEstimated: budgetItems.reduce(
      (sum, item) => sum + getEffectivePrice(item),
      0
    ),
    purchasedTotal: budgetItems
      .filter((item) => item.status === "PURCHASED")
      .reduce((sum, item) => sum + getEffectivePrice(item), 0),
    itemsByTimeframe: {
      NOW: pendingItems.filter((item) => item.timeframe === "NOW").length,
      SOON: pendingItems.filter((item) => item.timeframe === "SOON").length,
      LATER: pendingItems.filter((item) => item.timeframe === "LATER").length,
      SOMEDAY: pendingItems.filter((item) => item.timeframe === "SOMEDAY")
        .length,
      UNSET: pendingItems.filter((item) => !item.timeframe).length,
    },
    itemsByPerson: pendingItems.reduce(
      (acc, item) => {
        const key = item.assignedTo?.name ?? "Ikke tildelt"
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>
    ),
  }
}

export function calculateMaintenanceStats<T extends MaintenanceStatsTaskBase>(
  tasks: T[],
  now = new Date()
) {
  return {
    totalTasks: tasks.length,
    notStartedCount: tasks.filter((task) => task.status === "NOT_STARTED")
      .length,
    inProgressCount: tasks.filter((task) => task.status === "IN_PROGRESS")
      .length,
    completedCount: tasks.filter((task) => task.status === "COMPLETED").length,
    onHoldCount: tasks.filter((task) => task.status === "ON_HOLD").length,
    totalEstimatedCost: tasks.reduce(
      (sum, task) =>
        sum + (task.estimatedPrice ? Number(task.estimatedPrice) : 0),
      0
    ),
    highPriorityTasks: tasks.filter(
      (task) => task.priority === "HIGH" && task.status !== "COMPLETED"
    ),
    overdueTasks: tasks.filter(
      (task) =>
        task.dueDate != null &&
        new Date(task.dueDate) < now &&
        task.status !== "COMPLETED"
    ),
  }
}
