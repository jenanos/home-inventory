import { db } from "@workspace/db"

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

  // Shopping stats
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
    .reduce((sum, i) => sum + getEffectivePrice(i), 0)

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

  // Budget stats
  const toNum = (d: unknown): number => (d != null ? Number(d) : 0)

  const budgetStats = budget
    ? {
        hasBudget: true as const,
        totalGrossIncome: budget.members.reduce(
          (sum, m) => sum + toNum(m.grossMonthlyIncome),
          0
        ),
        totalNetIncome: budget.members.reduce(
          (sum, m) =>
            sum +
            toNum(m.grossMonthlyIncome) * (1 - toNum(m.taxPercent) / 100),
          0
        ),
        totalLoanPayments: budget.loans.reduce(
          (sum, l) =>
            sum +
            toNum(l.monthlyInterest) +
            toNum(l.monthlyPrincipal) +
            toNum(l.monthlyFees),
          0
        ),
        totalExpenses: budget.entries
          .filter((e) => e.type === "EXPENSE")
          .reduce((sum, e) => sum + toNum(e.monthlyAmount), 0),
        totalDeductions: budget.entries
          .filter((e) => e.type === "DEDUCTION")
          .reduce((sum, e) => sum + toNum(e.monthlyAmount), 0),
        memberCount: budget.members.length,
        loanCount: budget.loans.length,
        entryCount: budget.entries.length,
      }
    : { hasBudget: false as const }

  // Maintenance stats
  const maintenanceStats = {
    totalTasks: maintenanceTasks.length,
    notStartedCount: maintenanceTasks.filter((t) => t.status === "NOT_STARTED")
      .length,
    inProgressCount: maintenanceTasks.filter((t) => t.status === "IN_PROGRESS")
      .length,
    completedCount: maintenanceTasks.filter((t) => t.status === "COMPLETED")
      .length,
    onHoldCount: maintenanceTasks.filter((t) => t.status === "ON_HOLD").length,
    totalEstimatedCost: maintenanceTasks.reduce(
      (sum, t) => sum + (t.estimatedPrice ? Number(t.estimatedPrice) : 0),
      0
    ),
    highPriorityTasks: maintenanceTasks.filter(
      (t) => t.priority === "HIGH" && t.status !== "COMPLETED"
    ),
    overdueTasks: maintenanceTasks.filter(
      (t) =>
        t.dueDate &&
        new Date(t.dueDate) < new Date() &&
        t.status !== "COMPLETED"
    ),
  }

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
    budgetStats,
    maintenanceStats,
    maintenanceTasks,
  }
}
