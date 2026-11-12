import {
  calculateProjectStats,
  calculateShoppingStats,
} from "../dashboard-stats"
import type { ApplicationContext } from "@/lib/application/context"
import { calculateBudgetStats } from "@/lib/application/budget/calculations"
import { getBudget } from "@/lib/application/budget/read"
import { getHouseholdSettings } from "@/lib/application/households/read"
import { listProjects } from "@/lib/application/projects/read"
import {
  listShoppingCategories,
  listShoppingListsForDashboard,
} from "@/lib/application/shopping/read"

export async function getDashboardData(context: ApplicationContext) {
  const [lists, categories, budget, projects, settings] = await Promise.all([
    listShoppingListsForDashboard(context),
    listShoppingCategories(context),
    getBudget(context),
    listProjects(context),
    getHouseholdSettings(context),
  ])

  const householdLists = lists.filter((list) => !list.isPrivate)
  const privateLists = lists.filter((list) => list.isPrivate)
  const householdStats = calculateShoppingStats(
    householdLists.flatMap((list) => list.items),
    { moveInPeriodEndsOn: settings.moveInPeriodEndsOn }
  )
  const budgetStats = calculateBudgetStats(budget)
  const projectStats = calculateProjectStats(projects)

  return {
    householdLists,
    privateLists,
    categories,
    householdStats,
    budgetStats,
    projectStats,
    projects,
  }
}
