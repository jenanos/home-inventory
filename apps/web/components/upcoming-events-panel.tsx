import Link from "next/link"
import { Gift, PartyPopper } from "lucide-react"
import type { CalendarEventType } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import type { UpcomingEvent } from "@/lib/application/events/read"
import { describeGifts, summarizeGifts } from "@/lib/event-gifts"
import {
  EVENT_TYPE_CONFIG,
  describeYears,
  monthName,
  relativeDays,
} from "@/lib/event-labels"

/** One upcoming occurrence, reduced to what the row shows. Serializable. */
export type UpcomingEventRow = {
  id: string
  title: string
  type: CalendarEventType
  date: string
  daysUntil: number
  years: number | null
  giftCount: number
  giftsPurchased: number
}

export function toUpcomingRows(upcoming: UpcomingEvent[]): UpcomingEventRow[] {
  return upcoming.map(({ event, occurrence }) => {
    const gifts = summarizeGifts(event.shoppingLists)
    return {
      id: event.id,
      title: event.title,
      type: event.type,
      date: occurrence.date,
      daysUntil: occurrence.daysUntil,
      years: occurrence.years,
      giftCount: gifts.itemCount,
      giftsPurchased: gifts.purchasedCount,
    }
  })
}

/**
 * The next events with their gift status. Used on the events page and on the
 * dashboard; a server component, no client state.
 */
export function UpcomingEventsPanel({
  rows,
  emptyText = "Ingen hendelser de neste ukene.",
}: {
  rows: UpcomingEventRow[]
  emptyText?: string
}) {
  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center px-4 py-8 text-center">
        <PartyPopper className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <UpcomingEventRowCard key={`${row.id}-${row.date}`} row={row} />
      ))}
    </div>
  )
}

function UpcomingEventRowCard({ row }: { row: UpcomingEventRow }) {
  const type = EVENT_TYPE_CONFIG[row.type]
  const years = describeYears(row.type, row.years)
  const gifts = describeGifts({
    itemCount: row.giftCount,
    purchasedCount: row.giftsPurchased,
  })
  const allBought = row.giftCount > 0 && row.giftsPurchased === row.giftCount
  const soon = row.daysUntil <= 7

  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md border text-center leading-none",
            row.daysUntil === 0 && "border-primary bg-primary/10 text-primary"
          )}
        >
          <span className="text-base font-semibold tabular-nums">
            {Number(row.date.slice(8, 10))}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase">
            {monthName(Number(row.date.slice(5, 7))).slice(0, 3)}
          </span>
        </div>
        <Link
          href={`/hendelser/${row.id}`}
          className="flex min-w-0 flex-1 flex-col gap-1"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{row.title}</span>
            <Badge
              variant="secondary"
              className={cn("text-xs", type.className)}
            >
              {type.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className={cn(soon && "font-medium text-foreground")}>
              {relativeDays(row.daysUntil)}
            </span>
            {years ? ` · ${years}` : ""}
          </p>
        </Link>
        <Link
          href={`/hendelser/${row.id}#gaver`}
          className={cn(
            "flex shrink-0 items-center gap-1 text-xs",
            allBought
              ? "text-green-700 dark:text-green-400"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Gift className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {gifts ?? "Ingen gaveønsker"}
          </span>
          <span className="sm:hidden">
            {row.giftCount > 0 ? `${row.giftsPurchased}/${row.giftCount}` : "+"}
          </span>
        </Link>
      </CardContent>
    </Card>
  )
}
