import { db } from "@workspace/db"
import {
  calculateBudgetStats,
  calculateMaintenanceStats,
  calculateShoppingStats,
} from "../dashboard-stats"

export async function getDashboardData(householdId: string) {
  const [lists, categories, budget, maintenanceTasks] = await Promise.all([
    db.shoppingList.findMany({
      where: { householdId },
      include: {
        items: {
          include: {
            category: true,
            assignedTo: true,
            alternatives: {
              orderBy: { rank: "asc" },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.category.findMany({
      where: { householdId },
      orderBy: { name: "asc" },
    }),
    db.budget.findUnique({
      where: { householdId },
      include: {
        members: { orderBy: { sortOrder: "asc" } },
        loans: { orderBy: { sortOrder: "asc" } },
        entries: { orderBy: { sortOrder: "asc" } },
      },
    }),
    db.maintenanceTask.findMany({
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
    }),
  ])

  const allItems = lists.flatMap((l) => l.items)
  const stats = calculateShoppingStats(allItems)
  const budgetStats = calculateBudgetStats(budget)
  const maintenanceStats = calculateMaintenanceStats(maintenanceTasks)

  return {
    lists,
    categories,
    stats,
    budgetStats,
    maintenanceStats,
    maintenanceTasks,
  }
}
