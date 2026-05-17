import { db } from "@workspace/db"

export async function getBudget(householdId: string) {
  return db.budget.findUnique({
    where: { householdId },
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
