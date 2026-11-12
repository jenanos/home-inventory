import Link from "next/link"
import { PrivateShoppingListsOverview } from "@/components/private-shopping-lists-overview"
import { ShoppingStatsPanel } from "@/components/shopping-stats-panel"
import { ShoppingListCard } from "@/components/shopping-list-card"
import { ProjectCard } from "@/components/project-card"
import { ProjectStatsSummary } from "@/components/project-stats-summary"
import { BudgetStatsSummary } from "@/components/budget-stats-summary"
import { getShoppingListItemEffectivePrice } from "@/lib/shopping-list-pricing"
import { requireHousehold } from "@/lib/session"
import { getDashboardData } from "@/lib/queries/dashboard"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  ArrowRight,
  ListChecks,
  Hammer,
  Banknote,
  CalendarClock,
} from "lucide-react"
import { isActiveProject } from "@/lib/dashboard-stats"

export default async function DashboardPage() {
  const { context } = await requireHousehold()
  const {
    householdLists,
    privateLists,
    householdStats,
    budgetStats,
    projectStats,
    projects,
  } = await getDashboardData(context)

  const cashFlow = budgetStats.hasBudget ? budgetStats.disposable : 0

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
            disposableSubtitle="per måned, etter utgifter og sparing"
            items={[
              {
                label: "Inntekt",
                value: budgetStats.totalIncome,
                tone: "income",
              },
              {
                label: `Lån${budgetStats.loanCount > 0 ? ` (${budgetStats.loanCount})` : ""}`,
                value: budgetStats.totalLoanPayments,
                tone: "expense",
              },
              {
                label: "Utgifter",
                value: budgetStats.totalNonLoanExpenses,
                tone: "expense",
              },
              ...(budgetStats.totalSavings > 0
                ? [
                    {
                      label: "Sparing",
                      value: budgetStats.totalSavings,
                      tone: "savings" as const,
                    },
                  ]
                : []),
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

        {householdStats.totalItems > 0 && (
          <ShoppingStatsPanel stats={householdStats} />
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
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {householdLists.map((list) => {
              const itemCount = list.items.length
              const purchasedCount = list.items.filter(
                (i) => i.status === "PURCHASED"
              ).length
              const totalCost = list.items.reduce(
                (sum, item) => sum + getShoppingListItemEffectivePrice(item),
                0
              )

              return (
                <ShoppingListCard
                  key={list.id}
                  href={`/lists/${list.id}`}
                  name={list.name}
                  color={list.color}
                  itemCount={itemCount}
                  purchasedCount={purchasedCount}
                  totalCost={totalCost}
                />
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

      {/* ── PROJECTS SECTION ── */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl tracking-tight">Prosjekter</h2>
          <Link
            href="/prosjekter"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Se alle
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {projectStats.totalProjects > 0 ? (
          <>
            <ProjectStatsSummary
              stats={projectStats}
              scaleHref={(scale) =>
                `/prosjekter?omfang=${scale === "MAJOR" ? "storre" : "lopende"}`
              }
            />

            {projectStats.overdueProjects.length > 0 && (
              <Card className="border-red-200 bg-red-50 shadow-sm dark:border-red-900/50 dark:bg-red-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-300">
                    <CalendarClock className="h-4 w-4" />
                    Forfalte prosjekter
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    {projectStats.overdueProjects.map((project) => (
                      <Link
                        key={project.id}
                        href={`/prosjekter/${project.id}`}
                        className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-red-100 dark:hover:bg-red-900/30"
                      >
                        <span className="font-medium text-red-900 dark:text-red-200">
                          {project.title}
                        </span>
                        <span className="text-xs text-red-600 dark:text-red-400">
                          Forfalt{" "}
                          {new Date(project.dueDate!).toLocaleDateString(
                            "nb-NO"
                          )}
                        </span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {(() => {
              const activeProjects = projects
                .filter(isActiveProject)
                .slice(0, 6)
              if (activeProjects.length === 0) return null

              return (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {activeProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      className="shadow-sm"
                    />
                  ))}
                </div>
              )
            })()}
          </>
        ) : (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <Hammer className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Ingen prosjekter ennå.
              </p>
              <Link
                href="/prosjekter"
                className="mt-2 text-sm font-medium text-primary hover:underline"
              >
                Legg til prosjekter
              </Link>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
