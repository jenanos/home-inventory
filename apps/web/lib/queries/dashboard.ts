import {
  calculateMaintenanceStats,
  calculateShoppingStats,
} from "../dashboard-stats"
import type { ApplicationContext } from "@/lib/application/context"
import { calculateBudgetStats } from "@/lib/application/budget/calculations"
import { getBudget } from "@/lib/application/budget/read"
import { listMaintenanceTasks } from "@/lib/application/maintenance/read"
import {
  listShoppingCategories,
  listShoppingListsForDashboard,
} from "@/lib/application/shopping/read"

export async function getDashboardData(context: ApplicationContext) {
  const [lists, categories, budget, maintenanceTasks] = await Promise.all([
    listShoppingListsForDashboard(context),
    listShoppingCategories(context),
    getBudget(context),
    listMaintenanceTasks(context),
  ])

  const householdLists = lists.filter((list) => !list.isPrivate)
  const privateLists = lists.filter((list) => list.isPrivate)
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
