import Link from "next/link"
import { PrivateShoppingListsOverview } from "@/components/private-shopping-lists-overview"
import { ShoppingStatsSummary } from "@/components/shopping-stats-summary"
import { MaintenanceStatsSummary } from "@/components/maintenance-stats-summary"
import { BudgetStatsSummary } from "@/components/budget-stats-summary"
import { requireHousehold } from "@/lib/session"
import { getDashboardData } from "@/lib/queries/dashboard"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import {
  ArrowRight,
  ListChecks,
  Wrench,
  Banknote,
  CalendarClock,
} from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { Progress } from "@workspace/ui/components/progress"

const formatNOK = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

const phaseConfig = {
  BEFORE_MOVE: {
    label: "Før innflytting",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
  FIRST_WEEK: {
    label: "Første uke",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
  CAN_WAIT: {
    label: "Kan vente",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  NO_RUSH: {
    label: "Ingen hast",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  UNSET: {
    label: "Ikke satt",
    className: "bg-muted text-muted-foreground",
  },
} as const

const priorityConfig = {
  HIGH: {
    label: "Høy",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  MEDIUM: {
    label: "Medium",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  LOW: {
    label: "Lav",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
}

const statusConfig = {
  NOT_STARTED: {
    label: "Ikke startet",
    className:
      "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
  IN_PROGRESS: {
    label: "Pågår",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  COMPLETED: {
    label: "Fullført",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  ON_HOLD: {
    label: "På vent",
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
}

export default async function DashboardPage() {
  const { session, membership } = await requireHousehold()
  const {
    householdLists,
    privateLists,
    householdStats,
    budgetStats,
    maintenanceStats,
    maintenanceTasks,
  } = await getDashboardData(membership.householdId, session.user.id)

  // Budget calculations
  const cashFlow = budgetStats.hasBudget
    ? budgetStats.totalNetIncome -
      budgetStats.totalLoanPayments -
      budgetStats.totalExpenses +
      budgetStats.totalDeductions
    : 0

  return (
    <div className="flex flex-col gap-6 sm:gap-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl tracking-tight sm:text-3xl">
          Oversikt
        </h1>
      </div>

      {/* ── BUDGET SECTION ── */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl tracking-tight">Budsjett</h2>
          <Link
            href="/budsjett"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Se detaljer
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {budgetStats.hasBudget &&
        (budgetStats.memberCount > 0 ||
          budgetStats.loanCount > 0 ||
          budgetStats.entryCount > 0) ? (
          <BudgetStatsSummary
            disposable={cashFlow}
            disposableSubtitle="per måned, etter alle utgifter"
            items={[
              {
                label: "Inntekt",
                value: budgetStats.totalNetIncome,
                tone: "income",
              },
              {
                label: `Lån${budgetStats.loanCount > 0 ? ` (${budgetStats.loanCount})` : ""}`,
                value: budgetStats.totalLoanPayments,
                tone: "expense",
              },
              {
                label: "Utgifter",
                value: budgetStats.totalExpenses,
                tone: "expense",
              },
            ]}
          />
        ) : (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <Banknote className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Ingen budsjettdata ennå.
              </p>
              <Link
                href="/budsjett"
                className="mt-2 text-sm font-medium text-primary hover:underline"
              >
                Sett opp budsjett
              </Link>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── SHOPPING SECTION ── */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl tracking-tight">Innkjøp</h2>
          <Link
            href="/lists"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Se alle
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Shopping Stats */}
        {householdStats.totalItems > 0 && (
          <ShoppingStatsSummary
            totalEstimated={householdStats.totalEstimated}
            purchasedTotal={householdStats.purchasedTotal}
            totalCount={householdStats.totalItems}
            purchasedCount={householdStats.purchasedCount}
            pendingCount={householdStats.pendingCount}
          />
        )}

        {/* Phase Breakdown */}
        {householdStats.pendingCount > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Etter prioritet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {(
                  Object.entries(phaseConfig) as [
                    keyof typeof phaseConfig,
                    (typeof phaseConfig)[keyof typeof phaseConfig],
                  ][]
                ).map(([phase, config]) => {
                  const count =
                    householdStats.itemsByPhase[
                      phase as keyof typeof householdStats.itemsByPhase
                    ] ?? 0
                  if (count === 0) return null
                  return (
                    <div
                      key={phase}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-4 py-2.5",
                        config.className
                      )}
                    >
                      <span className="text-sm font-medium">
                        {config.label}
                      </span>
                      <span className="font-heading text-lg font-semibold">
                        {count}
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Shopping Lists Grid */}
        {householdLists.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <ListChecks className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Ingen felles handlelister ennå. Opprett en delt liste for å
                komme i gang!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {householdLists.map((list) => {
              const itemCount = list.items.length
              const purchasedCount = list.items.filter(
                (i) => i.status === "PURCHASED"
              ).length
              const progress =
                itemCount > 0
                  ? Math.round((purchasedCount / itemCount) * 100)
                  : 0

              return (
                <Link key={list.id} href={`/lists/${list.id}`}>
                  <Card className="group shadow-sm transition-shadow hover:shadow-md">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="font-heading text-lg">
                          {list.name}
                        </CardTitle>
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition-opacity sm:opacity-0 sm:group-hover:opacity-100" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                          {purchasedCount} av {itemCount} ting kjøpt
                        </span>
                        <Badge variant="secondary" className="tabular-nums">
                          {progress}%
                        </Badge>
                      </div>
                      {itemCount > 0 && (
                        <div className="mt-3 h-1.5 rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary transition-all"
                            style={{
                              width: `${progress}%`,
                            }}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}

        {privateLists.length > 0 && (
          <PrivateShoppingListsOverview
            lists={privateLists}
            title="Dine private innkjøp"
            description="Vises bare for deg og er skilt fra husholdningens fremdrift og kostnader."
          />
        )}
      </section>

      {/* ── MAINTENANCE SECTION ── */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl tracking-tight">Vedlikehold</h2>
          <Link
            href="/vedlikehold"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Se alle
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {maintenanceStats.totalTasks > 0 ? (
          <>
            {/* Maintenance Stats */}
            <MaintenanceStatsSummary
              totalEstimatedCost={maintenanceStats.totalEstimatedCost}
              totalTasks={maintenanceStats.totalTasks}
              notStartedCount={maintenanceStats.notStartedCount}
              inProgressCount={maintenanceStats.inProgressCount}
              completedCount={maintenanceStats.completedCount}
            />

            {/* Overdue tasks warning */}
            {maintenanceStats.overdueTasks.length > 0 && (
              <Card className="border-red-200 bg-red-50 shadow-sm dark:border-red-900/50 dark:bg-red-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-300">
                    <CalendarClock className="h-4 w-4" />
                    Forfalte oppgaver
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    {maintenanceStats.overdueTasks.map((task) => (
                      <Link
                        key={task.id}
                        href={`/vedlikehold/${task.id}`}
                        className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-red-100 dark:hover:bg-red-900/30"
                      >
                        <span className="font-medium text-red-900 dark:text-red-200">
                          {task.title}
                        </span>
                        <span className="text-xs text-red-600 dark:text-red-400">
                          Forfalt{" "}
                          {new Date(task.dueDate!).toLocaleDateString("nb-NO")}
                        </span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* High priority + in-progress tasks */}
            {(() => {
              const activeTasks = maintenanceTasks.filter(
                (t) => t.status !== "COMPLETED"
              )
              const displayTasks = activeTasks.slice(0, 6)
              if (displayTasks.length === 0) return null

              return (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {displayTasks.map((task) => {
                    const totalEntries = task.progressEntries.length
                    const completedEntries = task.progressEntries.filter(
                      (e) => e.completed
                    ).length
                    const progressPercent =
                      totalEntries > 0
                        ? Math.round((completedEntries / totalEntries) * 100)
                        : 0
                    const selectedVendor = task.vendors.find(
                      (v) => v.isSelected
                    )

                    return (
                      <Link key={task.id} href={`/vedlikehold/${task.id}`}>
                        <Card className="h-full shadow-sm transition-colors hover:bg-muted/50">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-base leading-tight">
                                {task.title}
                              </CardTitle>
                              <Badge
                                variant="secondary"
                                className={statusConfig[task.status].className}
                              >
                                {statusConfig[task.status].label}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className={
                                  priorityConfig[task.priority].className
                                }
                              >
                                {priorityConfig[task.priority].label}
                              </Badge>
                              {task.dueDate && (
                                <Badge variant="outline">
                                  {new Date(task.dueDate).toLocaleDateString(
                                    "nb-NO"
                                  )}
                                </Badge>
                              )}
                            </div>

                            {task.estimatedPrice != null && (
                              <p className="text-sm font-medium tabular-nums">
                                {formatNOK(Number(task.estimatedPrice))}
                              </p>
                            )}

                            {selectedVendor && (
                              <p className="text-xs text-muted-foreground">
                                Valgt aktør:{" "}
                                <span className="font-medium text-foreground">
                                  {selectedVendor.name}
                                </span>
                              </p>
                            )}

                            {totalEntries > 0 && (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Fremdrift
                                  </span>
                                  <span className="font-medium">
                                    {completedEntries}/{totalEntries}
                                  </span>
                                </div>
                                <Progress value={progressPercent} />
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    )
                  })}
                </div>
              )
            })()}
          </>
        ) : (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <Wrench className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Ingen vedlikeholdsoppgaver ennå.
              </p>
              <Link
                href="/vedlikehold"
                className="mt-2 text-sm font-medium text-primary hover:underline"
              >
                Legg til oppgaver
              </Link>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
