import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { CalendarEventType } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import { daysInMonth, formatDay } from "@/lib/application/events/dates"
import { EVENT_TYPE_DOT, WEEKDAY_SHORT, monthTitle } from "@/lib/event-labels"

export type CalendarEntry = {
  id: string
  title: string
  type: CalendarEventType
  /** `YYYY-MM-DD` of the occurrence in the shown month. */
  date: string
}

/** `?maned=` value for a month, e.g. `2027-03`. */
export function monthParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`
}

function shiftMonth(year: number, month: number, by: number) {
  const index = year * 12 + (month - 1) + by
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/**
 * A Monday-first month grid. On phones a day shows coloured dots; from `sm`
 * up it shows the names. Navigation is plain links, so the page stays a
 * server component.
 */
export function MonthCalendar({
  year,
  month,
  today,
  entries,
}: {
  year: number
  month: number
  today: string
  entries: CalendarEntry[]
}) {
  const previous = shiftMonth(year, month, -1)
  const next = shiftMonth(year, month, 1)
  const firstWeekday =
    (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const dayCount = daysInMonth(year, month)
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const byDay = new Map<number, CalendarEntry[]>()
  for (const entry of entries) {
    const day = Number(entry.date.slice(8, 10))
    byDay.set(day, [...(byDay.get(day) ?? []), entry])
  }
  const isCurrentMonth = today.startsWith(monthParam(year, month))

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link
              href={`/hendelser?maned=${monthParam(previous.year, previous.month)}`}
              aria-label="Forrige måned"
              scroll={false}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg">{monthTitle(year, month)}</h2>
            {!isCurrentMonth && (
              <Link
                href="/hendelser"
                scroll={false}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                I dag
              </Link>
            )}
          </div>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link
              href={`/hendelser?maned=${monthParam(next.year, next.month)}`}
              aria-label="Neste måned"
              scroll={false}
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-xs">
          {WEEKDAY_SHORT.map((weekday) => (
            <div
              key={weekday}
              className="bg-muted/50 py-1.5 text-center font-medium text-muted-foreground"
            >
              {weekday}
            </div>
          ))}
          {cells.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} className="bg-background/60" />
            }
            const date = formatDay(year, month, day)
            const dayEntries = byDay.get(day) ?? []
            const isToday = date === today

            return (
              <div
                key={date}
                className="flex min-h-12 min-w-0 flex-col gap-1 bg-background p-1 sm:min-h-20"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center self-end rounded-full text-[11px] tabular-nums sm:self-start",
                    isToday
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {day}
                </span>
                {dayEntries.length > 0 && (
                  <>
                    {/* Too small to tap; the month list below links them. */}
                    <div
                      className="flex flex-wrap gap-0.5 sm:hidden"
                      title={dayEntries.map((entry) => entry.title).join(", ")}
                    >
                      {dayEntries.map((entry) => (
                        <span
                          key={entry.id}
                          className={cn(
                            "h-2 w-2 rounded-full",
                            EVENT_TYPE_DOT[entry.type]
                          )}
                        />
                      ))}
                    </div>
                    <ul className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                      {dayEntries.slice(0, 3).map((entry) => (
                        <li key={entry.id} className="min-w-0">
                          <Link
                            href={`/hendelser/${entry.id}`}
                            className="flex min-w-0 items-center gap-1 rounded px-0.5 hover:bg-muted"
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                EVENT_TYPE_DOT[entry.type]
                              )}
                            />
                            <span className="truncate">{entry.title}</span>
                          </Link>
                        </li>
                      ))}
                      {dayEntries.length > 3 && (
                        <li className="px-0.5 text-muted-foreground">
                          +{dayEntries.length - 3}
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
