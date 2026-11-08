export { calculateBudgetStats } from "./application/budget/calculations"

type ShoppingItemStatus = "PENDING" | "PURCHASED" | "SKIPPED" | string
type ShoppingItemTimeframe = "NOW" | "SOON" | "LATER" | "SOMEDAY" | string

type ProjectStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ON_HOLD"
  | string
type ProjectPriority = "HIGH" | string

export type ShoppingStatsItemBase = {
  status: ShoppingItemStatus
  estimatedPrice?: unknown
  alternatives: Array<{ price?: unknown }>
  timeframe?: ShoppingItemTimeframe | null
  assignedTo?: { name: string | null } | null
}

export type ProjectStatsBase = {
  status: ProjectStatus
  priority?: ProjectPriority | null
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

export function calculateProjectStats<T extends ProjectStatsBase>(
  projects: T[],
  now = new Date()
) {
  return {
    totalProjects: projects.length,
    notStartedCount: projects.filter(
      (project) => project.status === "NOT_STARTED"
    ).length,
    inProgressCount: projects.filter(
      (project) => project.status === "IN_PROGRESS"
    ).length,
    completedCount: projects.filter((project) => project.status === "COMPLETED")
      .length,
    onHoldCount: projects.filter((project) => project.status === "ON_HOLD")
      .length,
    totalEstimatedCost: projects.reduce(
      (sum, project) =>
        sum + (project.estimatedPrice ? Number(project.estimatedPrice) : 0),
      0
    ),
    highPriorityProjects: projects.filter(
      (project) => project.priority === "HIGH" && project.status !== "COMPLETED"
    ),
    overdueProjects: projects.filter(
      (project) =>
        project.dueDate != null &&
        new Date(project.dueDate) < now &&
        project.status !== "COMPLETED"
    ),
  }
}
