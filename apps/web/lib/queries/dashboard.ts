import { db } from "@workspace/db"
import {
  calculateBudgetStats,
  calculateMaintenanceStats,
  calculateShoppingStats,
} from "../dashboard-stats"
import { getVisibleShoppingListsWhere } from "../shopping-list-access"

export async function getDashboardData(householdId: string, userId: string) {
  const [lists, categories, budget, maintenanceTasks] = await Promise.all([
    db.shoppingList.findMany({
      where: getVisibleShoppingListsWhere(householdId, userId),
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

  const householdLists = lists.filter((list) => !list.isPrivate)
  const privateLists = lists.filter(
    (list) => list.isPrivate && list.createdById === userId
  )
  const householdStats = calculateShoppingStats(
    householdLists.flatMap((list) => list.items)
  )
  const privateStats = calculateShoppingStats(
    privateLists.flatMap((list) => list.items)
  )
  const budgetStats = calculateBudgetStats(budget)
  const maintenanceStats = calculateMaintenanceStats(maintenanceTasks)

  return {
    householdLists,
    privateLists,
    categories,
    householdStats,
    privateStats,
    budgetStats,
    maintenanceStats,
    maintenanceTasks,
  }
}
