type ShoppingItemStatus = "PENDING" | "PURCHASED" | "SKIPPED" | string
type ShoppingItemPhase =
  | "BEFORE_MOVE"
  | "FIRST_WEEK"
  | "CAN_WAIT"
  | "NO_RUSH"
  | string

type BudgetEntryType = "EXPENSE" | "DEDUCTION" | string
type MaintenanceTaskStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ON_HOLD"
  | string
type MaintenanceTaskPriority = "HIGH" | string

export type ShoppingStatsItemBase = {
  status: ShoppingItemStatus
  estimatedPrice?: unknown
  alternatives: Array<{ price?: unknown }>
  phase?: ShoppingItemPhase | null
  assignedTo?: { name: string | null } | null
}

export type BudgetStatsInput = {
  members: Array<{ grossMonthlyIncome?: unknown; taxPercent?: unknown }>
  loans: Array<{
    monthlyInterest?: unknown
    monthlyPrincipal?: unknown
    monthlyFees?: unknown
  }>
  entries: Array<{ type: BudgetEntryType; monthlyAmount?: unknown }>
}

export type MaintenanceStatsTaskBase = {
  status: MaintenanceTaskStatus
  priority?: MaintenanceTaskPriority | null
  estimatedPrice?: unknown
  dueDate?: string | Date | null
}

function toNumber(value: unknown): number {
  return value != null ? Number(value) : 0
}

function getEffectivePrice(item: ShoppingStatsItemBase): number {
  if (item.estimatedPrice) return Number(item.estimatedPrice)
  const topAlt = item.alternatives[0]
  return topAlt?.price ? Number(topAlt.price) : 0
}

export function calculateShoppingStats<T extends ShoppingStatsItemBase>(items: T[]) {
  const budgetItems = items.filter((item) => item.status !== "SKIPPED")
  const pendingItems = items.filter((item) => item.status === "PENDING")

  return {
    totalItems: items.length,
    pendingCount: pendingItems.length,
    purchasedCount: items.filter((item) => item.status === "PURCHASED").length,
    totalEstimated: budgetItems.reduce(
      (sum, item) => sum + getEffectivePrice(item),
      0
    ),
    purchasedTotal: budgetItems
      .filter((item) => item.status === "PURCHASED")
      .reduce((sum, item) => sum + getEffectivePrice(item), 0),
    itemsByPhase: {
      BEFORE_MOVE: pendingItems.filter((item) => item.phase === "BEFORE_MOVE")
        .length,
      FIRST_WEEK: pendingItems.filter((item) => item.phase === "FIRST_WEEK")
        .length,
      CAN_WAIT: pendingItems.filter((item) => item.phase === "CAN_WAIT").length,
      NO_RUSH: pendingItems.filter((item) => item.phase === "NO_RUSH").length,
      UNSET: pendingItems.filter((item) => !item.phase).length,
    },
    itemsByPerson: pendingItems.reduce(
      (acc, item) => {
        const key = item.assignedTo?.name ?? "Ikke tildelt"
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>
    ),
  }
}

export function calculateBudgetStats(budget?: BudgetStatsInput | null) {
  if (!budget) {
    return { hasBudget: false as const }
  }

  return {
    hasBudget: true as const,
    totalGrossIncome: budget.members.reduce(
      (sum, member) => sum + toNumber(member.grossMonthlyIncome),
      0
    ),
    totalNetIncome: budget.members.reduce(
      (sum, member) =>
        sum +
        toNumber(member.grossMonthlyIncome) * (1 - toNumber(member.taxPercent) / 100),
      0
    ),
    totalLoanPayments: budget.loans.reduce(
      (sum, loan) =>
        sum +
        toNumber(loan.monthlyInterest) +
        toNumber(loan.monthlyPrincipal) +
        toNumber(loan.monthlyFees),
      0
    ),
    totalExpenses: budget.entries
      .filter((entry) => entry.type === "EXPENSE")
      .reduce((sum, entry) => sum + toNumber(entry.monthlyAmount), 0),
    totalDeductions: budget.entries
      .filter((entry) => entry.type === "DEDUCTION")
      .reduce((sum, entry) => sum + toNumber(entry.monthlyAmount), 0),
    memberCount: budget.members.length,
    loanCount: budget.loans.length,
    entryCount: budget.entries.length,
  }
}

export function calculateMaintenanceStats<T extends MaintenanceStatsTaskBase>(
  tasks: T[],
  now = new Date()
) {
  return {
    totalTasks: tasks.length,
    notStartedCount: tasks.filter((task) => task.status === "NOT_STARTED").length,
    inProgressCount: tasks.filter((task) => task.status === "IN_PROGRESS").length,
    completedCount: tasks.filter((task) => task.status === "COMPLETED").length,
    onHoldCount: tasks.filter((task) => task.status === "ON_HOLD").length,
    totalEstimatedCost: tasks.reduce(
      (sum, task) => sum + (task.estimatedPrice ? Number(task.estimatedPrice) : 0),
      0
    ),
    highPriorityTasks: tasks.filter(
      (task) => task.priority === "HIGH" && task.status !== "COMPLETED"
    ),
    overdueTasks: tasks.filter(
      (task) =>
        task.dueDate != null &&
        new Date(task.dueDate) < now &&
        task.status !== "COMPLETED"
    ),
  }
}
