import { db } from "@workspace/db"

import type { ApplicationContext } from "../context"

export async function getBudget(context: ApplicationContext) {
  return db.budget.findUnique({
    where: { householdId: context.householdId },
    include: {
      categories: { orderBy: { sortOrder: "asc" } },
      members: { orderBy: { sortOrder: "asc" } },
      loans: { orderBy: { sortOrder: "asc" } },
      trips: { orderBy: { sortOrder: "asc" } },
      entries: {
        orderBy: { sortOrder: "asc" },
        include: { category: true },
      },
    },
  })
}
