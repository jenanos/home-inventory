import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  shoppingListFindMany: vi.fn(),
  shoppingListFindFirst: vi.fn(),
  categoryFindMany: vi.fn(),
  budgetFindUnique: vi.fn(),
  maintenanceTaskFindMany: vi.fn(),
  maintenanceTaskFindFirst: vi.fn(),
  plantFindMany: vi.fn(),
  plantFindFirst: vi.fn(),
}))

vi.mock("@workspace/db", () => ({
  db: {
    shoppingList: {
      findMany: mocks.shoppingListFindMany,
      findFirst: mocks.shoppingListFindFirst,
    },
    category: {
      findMany: mocks.categoryFindMany,
    },
    budget: {
      findUnique: mocks.budgetFindUnique,
    },
    maintenanceTask: {
      findMany: mocks.maintenanceTaskFindMany,
      findFirst: mocks.maintenanceTaskFindFirst,
    },
    plant: {
      findMany: mocks.plantFindMany,
      findFirst: mocks.plantFindFirst,
    },
  },
}))

import { getBudget } from "./budget/read"
import { getMaintenanceTask, listMaintenanceTasks } from "./maintenance/read"
import { getPlant, listPlants } from "./garden/read"
import {
  getShoppingList,
  listShoppingCategories,
  listShoppingLists,
} from "./shopping/read"

const context = {
  userId: "user-1",
  householdId: "household-1",
  role: "MEMBER" as const,
}

describe("application read-service authorization boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const mock of Object.values(mocks)) {
      mock.mockResolvedValue([])
    }
    mocks.shoppingListFindFirst.mockResolvedValue(null)
    mocks.budgetFindUnique.mockResolvedValue(null)
    mocks.maintenanceTaskFindFirst.mockResolvedValue(null)
    mocks.plantFindFirst.mockResolvedValue(null)
  })

  it("filters shopping lists to shared and user-owned private lists", async () => {
    await listShoppingLists(context)

    expect(mocks.shoppingListFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          householdId: "household-1",
          OR: [{ isPrivate: false }, { createdById: "user-1" }],
        },
      })
    )
  })

  it("includes both the resource id and visibility boundary for list details", async () => {
    await getShoppingList(context, "list-1")

    expect(mocks.shoppingListFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "list-1",
          householdId: "household-1",
          OR: [{ isPrivate: false }, { createdById: "user-1" }],
        },
      })
    )
  })

  it("scopes shopping categories and budgets to the context household", async () => {
    await listShoppingCategories(context)
    await getBudget(context)

    expect(mocks.categoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "household-1" } })
    )
    expect(mocks.budgetFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "household-1" } })
    )
  })

  it("scopes maintenance collection and detail reads in the query", async () => {
    await listMaintenanceTasks(context)
    await getMaintenanceTask(context, "task-1")

    expect(mocks.maintenanceTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "household-1" } })
    )
    expect(mocks.maintenanceTaskFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-1", householdId: "household-1" },
      })
    )
  })

  it("scopes garden collection and detail reads in the query", async () => {
    await listPlants(context)
    await getPlant(context, "plant-1")

    expect(mocks.plantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "household-1" } })
    )
    expect(mocks.plantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "plant-1", householdId: "household-1" },
      })
    )
  })
})
