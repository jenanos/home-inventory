"use client"

import Link from "next/link"
import { Progress } from "@workspace/ui/components/progress"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import type {
  PurchaseMonth,
  ShoppingStats,
  TimeframeBucket,
} from "@/lib/dashboard-stats"
import { PRIORITY_CONFIG, formatNOK } from "@/lib/project-labels"
import { TIMEFRAME_LABELS } from "@/lib/shopping-timeframe"
import { ExpandableStats } from "./expandable-stats"
import { StatBreakdown, StatFigure, type BreakdownRow } from "./stat-breakdown"

const TIMEFRAME_ROW_LABELS: Record<TimeframeBucket, string> = {
  ...TIMEFRAME_LABELS,
  UNSET: "Ikke satt",
}

const ITEM_NOUN: [string, string] = ["vare", "varer"]

const dayFormatter = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})
const monthShort = new Intl.DateTimeFormat("nb-NO", {
  month: "short",
  timeZone: "UTC",
})
const monthLong = new Intl.DateTimeFormat("nb-NO", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

function monthDate(month: string) {
  return new Date(`${month}-01T00:00:00Z`)
}

export function ShoppingStatsPanel({
  stats,
  className,
}: {
  stats: ShoppingStats
  className?: string
}) {
  const { purchased, remaining } = stats
  const total = purchased.total + remaining.total
  const counted = purchased.count + remaining.count
  // Fall back to counts when prices are missing, so the bar is never a
  // misleading 0 %.
  const progress =
    total > 0
      ? Math.round((purchased.total / total) * 100)
      : counted > 0
        ? Math.round((purchased.count / counted) * 100)
        : 0

  const urgent = {
    count:
      stats.remainingByTimeframe.NOW.count +
      stats.remainingByTimeframe.SOON.count,
    total:
      stats.remainingByTimeframe.NOW.total +
      stats.remainingByTimeframe.SOON.total,
    unpriced:
      stats.remainingByTimeframe.NOW.unpriced +
      stats.remainingByTimeframe.SOON.unpriced,
  }

  const timeframeRows: BreakdownRow[] = (
    Object.keys(TIMEFRAME_ROW_LABELS) as TimeframeBucket[]
  ).map((key) => ({
    key,
    label: TIMEFRAME_ROW_LABELS[key],
    tally: stats.remainingByTimeframe[key],
  }))
  const priorityRows: BreakdownRow[] = (["HIGH", "MEDIUM", "LOW"] as const).map(
    (key) => ({
      key,
      label: `${PRIORITY_CONFIG[key].label} prioritet`,
      tally: stats.remainingByPriority[key],
    })
  )
  const toCategoryRows = (
    categories: ShoppingStats["remainingByCategory"]
  ): BreakdownRow[] =>
    categories.map(({ name, ...tally }) => ({ key: name, label: name, tally }))

  return (
    <ExpandableStats
      className={className}
      summary={
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatFigure label="Kjøpt" tally={purchased} noun={ITEM_NOUN} />
            <StatFigure label="Gjenstår" tally={remaining} noun={ITEM_NOUN} />
          </div>
          <div className="flex items-center gap-3">
            <Progress value={progress} className="flex-1" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
              {progress} % kjøpt
            </span>
          </div>
        </>
      }
    >
      <StatFigure
        label="Haster (snarest + snart)"
        tally={urgent}
        noun={ITEM_NOUN}
      />

      <Tabs defaultValue="remaining" className="gap-3">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="remaining" className="flex-none">
            Gjenstående
          </TabsTrigger>
          <TabsTrigger value="purchased" className="flex-none">
            Gjennomførte
          </TabsTrigger>
        </TabsList>

        <TabsContent value="remaining">
          <Tabs defaultValue="timeframe" className="gap-3">
            <TabsList className="h-8">
              <TabsTrigger value="timeframe" className="text-xs">
                Når
              </TabsTrigger>
              <TabsTrigger value="priority" className="text-xs">
                Prioritet
              </TabsTrigger>
              <TabsTrigger value="category" className="text-xs">
                Kategori
              </TabsTrigger>
            </TabsList>
            <TabsContent value="timeframe">
              <StatBreakdown
                rows={timeframeRows}
                countLabel={ITEM_NOUN}
                emptyText="Ingen gjenstående innkjøp."
              />
            </TabsContent>
            <TabsContent value="priority">
              <StatBreakdown
                rows={priorityRows}
                countLabel={ITEM_NOUN}
                emptyText="Ingen gjenstående innkjøp."
              />
            </TabsContent>
            <TabsContent value="category">
              <StatBreakdown
                rows={toCategoryRows(stats.remainingByCategory)}
                countLabel={ITEM_NOUN}
                emptyText="Ingen gjenstående innkjøp."
              />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="purchased" className="flex flex-col gap-4">
          <PurchasedPeriods stats={stats} />
          <PurchaseHistory
            months={stats.purchasesByMonth}
            moveInPeriodEndsOn={stats.moveInPeriodEndsOn}
          />
          {stats.purchasedByCategory.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Per kategori
              </p>
              <StatBreakdown
                rows={toCategoryRows(stats.purchasedByCategory)}
                countLabel={ITEM_NOUN}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </ExpandableStats>
  )
}

function PurchasedPeriods({ stats }: { stats: ShoppingStats }) {
  const periods = stats.purchasedByPeriod
  const endLabel = stats.moveInPeriodEndsOn
    ? dayFormatter.format(new Date(`${stats.moveInPeriodEndsOn}T00:00:00Z`))
    : null

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {periods && (
          <>
            <StatFigure
              label={`Innflytting (t.o.m. ${endLabel})`}
              tally={periods.moveIn}
              noun={ITEM_NOUN}
            />
            <StatFigure
              label="Etter innflytting"
              tally={periods.afterMoveIn}
              noun={ITEM_NOUN}
            />
          </>
        )}
        <StatFigure
          label="Siste 30 dager"
          tally={stats.purchasedLast30Days}
          noun={ITEM_NOUN}
        />
      </div>
      {!periods && (
        <p className="text-xs text-muted-foreground">
          <Link href="/settings#husstand" className="underline">
            Angi når innflyttingen var ferdig
          </Link>{" "}
          for å se innflyttingskjøpene for seg.
        </p>
      )}
      {stats.purchasedUndated.count > 0 && (
        <p className="text-xs text-muted-foreground">
          {stats.purchasedUndated.count}{" "}
          {stats.purchasedUndated.count === 1 ? "vare" : "varer"} mangler
          kjøpsdato og er ikke med i periodene.
        </p>
      )}
    </div>
  )
}

/**
 * One bar per month, a single series. The move-in months sit on a labelled
 * band instead of a second color, so the split never depends on telling two
 * hues apart.
 */
function PurchaseHistory({
  months,
  moveInPeriodEndsOn,
}: {
  months: PurchaseMonth[]
  moveInPeriodEndsOn: string | null
}) {
  if (months.length === 0) return null
  const max = Math.max(...months.map((month) => month.total), 0)
  const moveInCount = months.filter((month) => month.inMoveIn).length
  const largest = months.reduce((best, month) =>
    month.total > best.total ? month : best
  )

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-muted-foreground">
          Kjøpt per måned
        </span>
        {max > 0 && (
          <span className="text-muted-foreground">
            Mest i {monthLong.format(monthDate(largest.month))}:{" "}
            <span className="text-foreground tabular-nums">
              {formatNOK(largest.total)}
            </span>
          </span>
        )}
      </figcaption>

      <div className="relative">
        {moveInCount > 0 && moveInPeriodEndsOn && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 rounded-md bg-muted"
            style={{ width: `${(moveInCount / months.length) * 100}%` }}
            aria-hidden
          >
            <span className="absolute top-1 left-1.5 text-[10px] font-medium text-muted-foreground">
              Innflytting
            </span>
          </div>
        )}
        <ol
          className="relative flex h-32 items-end gap-0.5 px-0.5 pt-5"
          aria-label="Kjøpt per måned"
        >
          {months.map((month) => {
            const height = max > 0 ? (month.total / max) * 100 : 0
            const name = monthLong.format(monthDate(month.month))
            const description = `${name}: ${formatNOK(month.total)}, ${month.count} ${month.count === 1 ? "vare" : "varer"}`
            return (
              <li
                key={month.month}
                className="group relative flex h-full flex-1 items-end"
                title={description}
              >
                <span className="sr-only">{description}</span>
                {month.count > 0 && (
                  <div
                    className="w-full rounded-t-[4px] bg-primary/80 transition-colors group-hover:bg-primary"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                )}
              </li>
            )
          })}
        </ol>
      </div>
      <div className="flex gap-0.5 px-0.5" aria-hidden>
        {months.map((month, index) => (
          <span
            key={month.month}
            className="flex-1 text-center text-[10px] text-muted-foreground"
          >
            {/* Every month on short ranges, every other on long ones. */}
            {months.length <= 8 || index % 2 === (months.length - 1) % 2
              ? monthShort.format(monthDate(month.month)).replace(".", "")
              : ""}
          </span>
        ))}
      </div>
    </figure>
  )
}
