import Link from "next/link"
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
  Wallet,
  ShoppingCart,
  Clock,
  CheckCircle2,
  ArrowRight,
  ListChecks,
} from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { CreateListDialog } from "./create-list-dialog"

const formatNOK = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

const phaseConfig = {
  BEFORE_MOVE: { label: "Før innflytting", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  FIRST_WEEK: { label: "Første uke", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  CAN_WAIT: { label: "Kan vente", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  NO_RUSH: { label: "Ingen hast", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  UNSET: { label: "Ikke satt", className: "bg-muted text-muted-foreground" },
} as const

export default async function DashboardPage() {
  const { membership } = await requireHousehold()
  const { lists, stats } = await getDashboardData(membership.householdId)

  const budgetProgress =
    stats.totalEstimated > 0
      ? Math.round((stats.purchasedTotal / stats.totalEstimated) * 100)
      : 0

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl tracking-tight">Oversikt</h1>
        <CreateListDialog />
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totalt budsjett
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-heading text-2xl font-semibold text-primary">
              {formatNOK(stats.totalEstimated)}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Kjøpt
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-heading text-2xl font-semibold">
              {formatNOK(stats.purchasedTotal)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(budgetProgress, 100)}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {budgetProgress}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Gjenstående
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-heading text-2xl font-semibold">
              {stats.pendingCount}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.pendingCount === 1 ? "ting igjen" : "ting igjen"}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Kjøpt
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-heading text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
              {stats.purchasedCount}
            </div>
            <p className="text-xs text-muted-foreground">
              av {stats.totalItems} totalt
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Phase Breakdown */}
      {stats.pendingCount > 0 && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-lg">
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
                  stats.itemsByPhase[
                    phase as keyof typeof stats.itemsByPhase
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
                    <span className="text-sm font-medium">{config.label}</span>
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
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-xl tracking-tight">Handlelister</h2>

        {lists.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ListChecks className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                Ingen handlelister ennå. Opprett din første liste for å komme i
                gang!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => {
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
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                          {purchasedCount} av {itemCount}{" "}
                          {itemCount === 1 ? "ting" : "ting"} kjøpt
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
      </div>
    </div>
  )
}
