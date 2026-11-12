import { Card, CardContent } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import type { ProjectStats, ScaleKey } from "@/lib/dashboard-stats"
import { PRIORITY_CONFIG, PROJECT_SCALE_LABELS } from "@/lib/project-labels"
import { StatBreakdown, StatFigure, type BreakdownRow } from "./stat-breakdown"

const PROJECT_NOUN: [string, string] = ["prosjekt", "prosjekter"]

const STATUS_SEGMENTS = [
  {
    key: "completedCount",
    label: "fullført",
    className: "bg-emerald-500 dark:bg-emerald-500/90",
  },
  {
    key: "inProgressCount",
    label: "pågår",
    className: "bg-blue-500 dark:bg-blue-500/90",
  },
  {
    key: "notStartedCount",
    label: "ikke startet",
    className: "bg-muted-foreground/40",
  },
  {
    key: "onHoldCount",
    label: "på vent",
    className: "bg-orange-400 dark:bg-orange-400/90",
  },
] as const

interface ProjectStatsSummaryProps {
  stats: ProjectStats
  /** Show the routine/major split, with a link per row to filter on it. */
  scaleHref?: (scale: ScaleKey) => string
  className?: string
}

export function ProjectStatsSummary({
  stats,
  scaleHref,
  className,
}: ProjectStatsSummaryProps) {
  const total = stats.totalProjects

  const priorityRows: BreakdownRow[] = (["HIGH", "MEDIUM", "LOW"] as const).map(
    (key) => ({
      key,
      label: `${PRIORITY_CONFIG[key].label} prioritet`,
      tally: stats.remainingByPriority[key],
    })
  )
  const scaleRows: BreakdownRow[] = (["ROUTINE", "MAJOR"] as const).map(
    (key) => ({
      key,
      label: PROJECT_SCALE_LABELS[key],
      tally: stats.remainingByScale[key],
      href: scaleHref?.(key),
    })
  )

  return (
    <Card size="sm" className={cn("shadow-sm", className)}>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatFigure
            label="Gjenstår (aktive)"
            tally={stats.remaining}
            noun={PROJECT_NOUN}
          />
          <StatFigure
            label="Fullført"
            tally={stats.completed}
            noun={PROJECT_NOUN}
          />
          <StatFigure
            label="På vent"
            tally={stats.onHold}
            noun={PROJECT_NOUN}
            muted
            note="ikke medregnet"
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {total > 0 && (
          <div className="flex flex-col gap-2">
            <div
              className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={STATUS_SEGMENTS.map(
                (segment) => `${stats[segment.key]} ${segment.label}`
              ).join(", ")}
            >
              {STATUS_SEGMENTS.map((segment) =>
                stats[segment.key] > 0 ? (
                  <div
                    key={segment.key}
                    className={segment.className}
                    style={{ width: `${(stats[segment.key] / total) * 100}%` }}
                  />
                ) : null
              )}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {STATUS_SEGMENTS.map((segment) => (
                <li key={segment.key} className="flex items-center gap-1.5">
                  <span
                    className={cn("h-2 w-2 rounded-full", segment.className)}
                    aria-hidden
                  />
                  <span className="font-medium text-foreground tabular-nums">
                    {stats[segment.key]}
                  </span>
                  {segment.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {stats.remaining.count > 0 && (
          <div
            className={cn("grid gap-4", scaleHref && "sm:grid-cols-2 sm:gap-6")}
          >
            {scaleHref && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Gjenstår per omfang
                </p>
                <StatBreakdown rows={scaleRows} countLabel={PROJECT_NOUN} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Gjenstår per prioritet
              </p>
              <StatBreakdown rows={priorityRows} countLabel={PROJECT_NOUN} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
