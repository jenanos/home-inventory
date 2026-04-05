import { db } from "@workspace/db"

export async function getBudget(householdId: string) {
  return db.budget.findUnique({
    where: { householdId },
    include: {
      members: { orderBy: { sortOrder: "asc" } },
      loans: { orderBy: { sortOrder: "asc" } },
      entries: { orderBy: { sortOrder: "asc" } },
    },
  })
}
