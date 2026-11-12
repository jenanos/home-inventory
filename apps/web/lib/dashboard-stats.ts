export { calculateBudgetStats } from "./application/budget/calculations"

/**
 * Pure numbers behind the shopping and project summaries. Kept free of the
 * database client so tests and client components can use the result; every
 * returned value is plain data that can cross the server/client boundary.
 */

const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const
const TIMEFRAME_BUCKETS = ["NOW", "SOON", "LATER", "SOMEDAY", "UNSET"] as const
const SCALES = ["ROUTINE", "MAJOR"] as const

export type PriorityKey = (typeof PRIORITIES)[number]
export type TimeframeBucket = (typeof TIMEFRAME_BUCKETS)[number]
export type ScaleKey = (typeof SCALES)[number]

/** How many things and what they add up to. `unpriced` have no price at all. */
export type Tally = { count: number; total: number; unpriced: number }

function emptyTally(): Tally {
  return { count: 0, total: 0, unpriced: 0 }
}

function addTo(tally: Tally, price: number | null) {
  tally.count += 1
  if (price == null) tally.unpriced += 1
  else tally.total += price
}

function tallyBy<K extends string>(keys: readonly K[]): Record<K, Tally> {
  return Object.fromEntries(keys.map((key) => [key, emptyTally()])) as Record<
    K,
    Tally
  >
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

// Explicit time zone: the server runs in UTC, the household does not.
const osloDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** `YYYY-MM-DD` of an instant, as the calendar in Norway shows it. */
export function toOsloDay(value: string | Date) {
  return osloDay.format(new Date(value))
}

// ─── Shopping ───────────────────────────────────────────────────

export type ShoppingStatsItemBase = {
  status: string
  estimatedPrice?: unknown
  alternatives: Array<{ price?: unknown }>
  timeframe?: string | null
  priority?: string | null
  purchasedAt?: string | Date | null
  category?: { name: string } | null
}

/**
 * Same precedence as the list page (`getShoppingListItemEffectivePrice`): the
 * preferred alternative's price, else the item's own estimate. Null when the
 * item has neither.
 */
function itemPrice(item: ShoppingStatsItemBase): number | null {
  return toNumber(item.alternatives[0]?.price) ?? toNumber(item.estimatedPrice)
}

export type PurchaseMonth = {
  /** `YYYY-MM` */
  month: string
  count: number
  total: number
  /** At least one day of the month is inside the move-in period. */
  inMoveIn: boolean
}

export type ShoppingStatsOptions = {
  /** Last day of the move-in period (`YYYY-MM-DD`), or null when not set. */
  moveInPeriodEndsOn?: string | null
  now?: Date
  /** How many months the purchase history goes back at most. */
  historyMonths?: number
}

function previousMonths(lastMonth: string, count: number) {
  const [year, month] = lastMonth.split("-").map(Number) as [number, number]
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1))
    return date.toISOString().slice(0, 7)
  })
}

export function calculateShoppingStats<T extends ShoppingStatsItemBase>(
  items: T[],
  {
    moveInPeriodEndsOn = null,
    now = new Date(),
    historyMonths = 12,
  }: ShoppingStatsOptions = {}
) {
  const purchased = emptyTally()
  const remaining = emptyTally()
  const remainingByTimeframe = tallyBy(TIMEFRAME_BUCKETS)
  const remainingByPriority = tallyBy(PRIORITIES)
  const remainingByCategory = new Map<string, Tally>()
  const purchasedByCategory = new Map<string, Tally>()
  const moveIn = emptyTally()
  const afterMoveIn = emptyTally()
  const undated = emptyTally()
  const last30Days = emptyTally()
  const byMonth = new Map<string, { count: number; total: number }>()

  const today = toOsloDay(now)
  const thirtyDaysAgo = toOsloDay(new Date(now.getTime() - 30 * 86_400_000))
  let skippedCount = 0

  for (const item of items) {
    const price = itemPrice(item)
    const categoryName = item.category?.name ?? "Uten kategori"

    if (item.status === "PENDING") {
      addTo(remaining, price)
      const timeframe = (TIMEFRAME_BUCKETS as readonly string[]).includes(
        item.timeframe ?? ""
      )
        ? (item.timeframe as TimeframeBucket)
        : "UNSET"
      addTo(remainingByTimeframe[timeframe], price)
      const priority = (PRIORITIES as readonly string[]).includes(
        item.priority ?? ""
      )
        ? (item.priority as PriorityKey)
        : "MEDIUM"
      addTo(remainingByPriority[priority], price)
      const category = remainingByCategory.get(categoryName) ?? emptyTally()
      addTo(category, price)
      remainingByCategory.set(categoryName, category)
    } else if (item.status === "PURCHASED") {
      addTo(purchased, price)
      const category = purchasedByCategory.get(categoryName) ?? emptyTally()
      addTo(category, price)
      purchasedByCategory.set(categoryName, category)

      if (!item.purchasedAt) {
        addTo(undated, price)
        continue
      }
      const day = toOsloDay(item.purchasedAt)
      if (moveInPeriodEndsOn) {
        addTo(day <= moveInPeriodEndsOn ? moveIn : afterMoveIn, price)
      }
      if (day >= thirtyDaysAgo && day <= today) addTo(last30Days, price)
      const month = day.slice(0, 7)
      const bucket = byMonth.get(month) ?? { count: 0, total: 0 }
      bucket.count += 1
      bucket.total += price ?? 0
      byMonth.set(month, bucket)
    } else {
      skippedCount += 1
    }
  }

  // A continuous run of months, so quiet months show as gaps rather than
  // disappearing: from the first purchase (at most `historyMonths` back) to now.
  const currentMonth = today.slice(0, 7)
  const firstMonth = [...byMonth.keys()].sort()[0]
  const window = previousMonths(currentMonth, historyMonths)
  const months: PurchaseMonth[] = firstMonth
    ? window
        .filter((month) => month >= firstMonth)
        .map((month) => ({
          month,
          count: byMonth.get(month)?.count ?? 0,
          total: byMonth.get(month)?.total ?? 0,
          inMoveIn:
            moveInPeriodEndsOn != null &&
            month <= moveInPeriodEndsOn.slice(0, 7),
        }))
    : []
  const olderThanWindow = [...byMonth.entries()]
    .filter(([month]) => month < (window[0] ?? ""))
    .reduce(
      (sum, [, bucket]) => ({
        count: sum.count + bucket.count,
        total: sum.total + bucket.total,
      }),
      { count: 0, total: 0 }
    )

  const sortCategories = (map: Map<string, Tally>) =>
    [...map.entries()]
      .map(([name, tally]) => ({ name, ...tally }))
      .sort((a, b) => b.total - a.total || b.count - a.count)

  return {
    totalItems: items.length,
    pendingCount: remaining.count,
    purchasedCount: purchased.count,
    skippedCount,
    purchased,
    remaining,
    remainingByTimeframe,
    remainingByPriority,
    remainingByCategory: sortCategories(remainingByCategory),
    purchasedByCategory: sortCategories(purchasedByCategory),
    moveInPeriodEndsOn,
    /** Null until the household sets a move-in period. */
    purchasedByPeriod: moveInPeriodEndsOn
      ? { moveIn, afterMoveIn, undated }
      : null,
    purchasedLast30Days: last30Days,
    purchasedUndated: undated,
    purchasesByMonth: months,
    purchasesBeforeHistory: olderThanWindow,
  }
}

export type ShoppingStats = ReturnType<typeof calculateShoppingStats>

// ─── Projects ───────────────────────────────────────────────────

export type ProjectStatsBase = {
  status: string
  priority?: string | null
  scale?: string | null
  estimatedPrice?: unknown
  dueDate?: string | Date | null
}

/** Projects someone is working on or is going to: not done, not parked. */
export function isActiveProject(project: { status: string }) {
  return project.status === "NOT_STARTED" || project.status === "IN_PROGRESS"
}

export function calculateProjectStats<T extends ProjectStatsBase>(
  projects: T[],
  now = new Date()
) {
  const remaining = emptyTally()
  const completed = emptyTally()
  const onHold = emptyTally()
  const remainingByPriority = tallyBy(PRIORITIES)
  const remainingByScale = tallyBy(SCALES)
  const countByScale = Object.fromEntries(
    SCALES.map((scale) => [scale, 0])
  ) as Record<ScaleKey, number>

  for (const project of projects) {
    const price = toNumber(project.estimatedPrice)
    const scale: ScaleKey = project.scale === "MAJOR" ? "MAJOR" : "ROUTINE"
    countByScale[scale] += 1

    if (isActiveProject(project)) {
      addTo(remaining, price)
      const priority = (PRIORITIES as readonly string[]).includes(
        project.priority ?? ""
      )
        ? (project.priority as PriorityKey)
        : "MEDIUM"
      addTo(remainingByPriority[priority], price)
      addTo(remainingByScale[scale], price)
    } else if (project.status === "COMPLETED") {
      addTo(completed, price)
    } else if (project.status === "ON_HOLD") {
      addTo(onHold, price)
    }
  }

  return {
    totalProjects: projects.length,
    notStartedCount: projects.filter(
      (project) => project.status === "NOT_STARTED"
    ).length,
    inProgressCount: projects.filter(
      (project) => project.status === "IN_PROGRESS"
    ).length,
    completedCount: completed.count,
    onHoldCount: onHold.count,
    remaining,
    completed,
    onHold,
    remainingByPriority,
    remainingByScale,
    countByScale,
    highPriorityProjects: projects.filter(
      (project) => project.priority === "HIGH" && isActiveProject(project)
    ),
    overdueProjects: projects.filter(
      (project) =>
        project.dueDate != null &&
        new Date(project.dueDate) < now &&
        isActiveProject(project)
    ),
  }
}

export type ProjectStats = Omit<
  ReturnType<typeof calculateProjectStats>,
  "highPriorityProjects" | "overdueProjects"
>
