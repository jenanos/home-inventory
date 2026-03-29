import { db } from "@workspace/db"

export async function getDashboardData(householdId: string) {
  const [lists, categories] = await Promise.all([
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
  ])

  const allItems = lists.flatMap((l) => l.items)
  const budgetItems = allItems.filter((item) => item.status !== "SKIPPED")
  const pendingItems = allItems.filter((i) => i.status === "PENDING")

  function getEffectivePrice(item: (typeof allItems)[number]): number {
    if (item.estimatedPrice) return Number(item.estimatedPrice)
    const topAlt = item.alternatives[0]
    return topAlt?.price ? Number(topAlt.price) : 0
  }

  const totalEstimated = budgetItems.reduce(
    (sum, i) => sum + getEffectivePrice(i),
    0
  )
  const purchasedTotal = budgetItems
    .filter((i) => i.status === "PURCHASED")
    .reduce(
      (sum, i) => sum + getEffectivePrice(i),
      0
    )

  const itemsByPhase = {
    BEFORE_MOVE: pendingItems.filter((i) => i.phase === "BEFORE_MOVE").length,
    FIRST_WEEK: pendingItems.filter((i) => i.phase === "FIRST_WEEK").length,
    CAN_WAIT: pendingItems.filter((i) => i.phase === "CAN_WAIT").length,
    NO_RUSH: pendingItems.filter((i) => i.phase === "NO_RUSH").length,
    UNSET: pendingItems.filter((i) => !i.phase).length,
  }

  const itemsByPerson = pendingItems.reduce(
    (acc, item) => {
      const key = item.assignedTo?.name ?? "Ikke tildelt"
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return {
    lists,
    categories,
    stats: {
      totalItems: allItems.length,
      pendingCount: pendingItems.length,
      purchasedCount: allItems.filter((i) => i.status === "PURCHASED").length,
      totalEstimated,
      purchasedTotal,
      itemsByPhase,
      itemsByPerson,
    },
  }
}
