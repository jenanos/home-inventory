import { Card, CardContent } from "@workspace/ui/components/card"
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

const formatNOK = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

interface ProjectStatsSummaryProps {
  totalEstimatedCost: number
  totalProjects: number
  notStartedCount: number
  inProgressCount: number
  completedCount: number
  className?: string
}

export function ProjectStatsSummary({
  totalEstimatedCost,
  totalProjects,
  notStartedCount,
  inProgressCount,
  completedCount,
  className,
}: ProjectStatsSummaryProps) {
  const completedPct =
    totalProjects > 0 ? (completedCount / totalProjects) * 100 : 0
  const inProgressPct =
    totalProjects > 0 ? (inProgressCount / totalProjects) * 100 : 0
  const notStartedPct =
    totalProjects > 0 ? (notStartedCount / totalProjects) * 100 : 0

  return (
    <Card size="sm" className={cn("shadow-sm", className)}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Totalt estimert</p>
            <p className="font-heading text-xl font-semibold tabular-nums sm:text-2xl">
              {totalEstimatedCost > 0 ? formatNOK(totalEstimatedCost) : "—"}
            </p>
          </div>
          <span className="shrink-0 text-sm text-muted-foreground">
            <span className="tabular-nums">{totalProjects}</span>{" "}
            {totalProjects === 1 ? "prosjekt" : "prosjekter"}
          </span>
        </div>

        {totalProjects > 0 && (
          <div
            className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label="Statusfordeling"
          >
            {completedPct > 0 && (
              <div
                className="bg-emerald-500 dark:bg-emerald-500/90"
                style={{ width: `${completedPct}%` }}
              />
            )}
            {inProgressPct > 0 && (
              <div
                className="bg-blue-500 dark:bg-blue-500/90"
                style={{ width: `${inProgressPct}%` }}
              />
            )}
            {notStartedPct > 0 && (
              <div
                className="bg-muted-foreground/30"
                style={{ width: `${notStartedPct}%` }}
              />
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground tabular-nums">
              {notStartedCount}
            </span>{" "}
            ikke startet
          </span>
          <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-medium tabular-nums">
              {inProgressCount}
            </span>{" "}
            pågår
          </span>
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-medium tabular-nums">
              {completedCount}
            </span>{" "}
            fullført
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
