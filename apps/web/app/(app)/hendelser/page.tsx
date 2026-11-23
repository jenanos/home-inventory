import Link from "next/link"
import { CalendarHeart, Plus } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import {
  UpcomingEventsPanel,
  toUpcomingRows,
} from "@/components/upcoming-events-panel"
import {
  formatDay,
  occurrencesBetween,
  osloToday,
  parseDay,
  yearsAt,
  daysInMonth,
} from "@/lib/application/events/dates"
import { listEvents, upcomingFrom } from "@/lib/application/events/read"
import {
  EVENT_TYPE_CONFIG,
  describeYears,
  formatEventDay,
  monthName,
} from "@/lib/event-labels"
import { requireHousehold } from "@/lib/session"
import { EventFormDialog } from "./event-form-dialog"
import { MonthCalendar, type CalendarEntry } from "./month-calendar"

/** How far ahead "Kommende" looks. */
const UPCOMING_DAYS = 60

interface HendelserPageProps {
  searchParams: Promise<{ maned?: string }>
}

/** `?maned=2027-03`, or the current month when missing or malformed. */
function resolveMonth(param: string | undefined, today: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(param ?? "")
  const month = match ? Number(match[2]) : 0
  if (match && month >= 1 && month <= 12) {
    return { year: Number(match[1]), month }
  }
  const { year, month: current } = parseDay(today)
  return { year, month: current }
}

export default async function HendelserPage({
  searchParams,
}: HendelserPageProps) {
  const params = await searchParams
  const { context } = await requireHousehold()
  const events = await listEvents(context)
  const today = osloToday()
  const shown = resolveMonth(params.maned, today)

  const upcoming = toUpcomingRows(
    upcomingFrom(events, today, { withinDays: UPCOMING_DAYS })
  )

  const monthStart = formatDay(shown.year, shown.month, 1)
  const monthEnd = formatDay(
    shown.year,
    shown.month,
    daysInMonth(shown.year, shown.month)
  )
  const monthEntries = events
    .flatMap((event) =>
      occurrencesBetween(event, monthStart, monthEnd).map((date) => ({
        event,
        date,
      }))
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.event.title.localeCompare(b.event.title, "nb-NO")
    )
  const calendarEntries: CalendarEntry[] = monthEntries.map(
    ({ event, date }) => ({
      id: event.id,
      title: event.title,
      type: event.type,
      date,
    })
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Hendelser
          </h1>
          <p className="text-sm text-muted-foreground">
            Bursdager og merkedager, med gaveønsker og hva som er kjøpt
          </p>
        </div>
        <EventFormDialog
          defaultMonth={shown.month}
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ny hendelse
            </Button>
          }
        />
      </div>

      {events.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <CalendarHeart className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="font-heading text-lg font-medium">
            Ingen hendelser ennå
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Legg inn bursdagene i familien her, eller be en assistent koblet til
            via MCP om å legge dem inn
          </p>
        </Card>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-lg font-semibold">
              Kommende
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                neste {UPCOMING_DAYS} dager
              </span>
            </h2>
            <UpcomingEventsPanel rows={upcoming} />
          </section>

          <section className="flex flex-col gap-3">
            <MonthCalendar
              year={shown.year}
              month={shown.month}
              today={today}
              entries={calendarEntries}
            />

            {monthEntries.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">
                Ingen hendelser i {monthName(shown.month)}.
              </p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {monthEntries.map(({ event, date }) => {
                  const type = EVENT_TYPE_CONFIG[event.type]
                  const years = describeYears(event.type, yearsAt(event, date))
                  const { day } = parseDay(date)
                  return (
                    <li key={`${event.id}-${date}`}>
                      <Link
                        href={`/hendelser/${event.id}`}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50",
                          date === today && "bg-primary/5"
                        )}
                      >
                        <span className="w-20 shrink-0 text-muted-foreground tabular-nums">
                          {formatEventDay(day, shown.month)}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {event.title}
                        </span>
                        {years && (
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            {years}
                          </span>
                        )}
                        <Badge
                          variant="secondary"
                          className={cn("shrink-0 text-xs", type.className)}
                        >
                          {type.label}
                        </Badge>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <AllEvents events={events} />
        </>
      )}
    </div>
  )
}

/** Every event by month, so one far ahead is still easy to find. */
function AllEvents({
  events,
}: {
  events: Awaited<ReturnType<typeof listEvents>>
}) {
  const months = new Map<number, typeof events>()
  for (const event of events) {
    months.set(event.month, [...(months.get(event.month) ?? []), event])
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold">
        Alle hendelser
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {events.length}
        </span>
      </h2>
      <Card size="sm">
        <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...months.entries()].map(([month, monthEvents]) => (
            <div key={month} className="flex flex-col gap-1">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {monthName(month)}
              </h3>
              <ul className="flex flex-col gap-0.5 text-sm">
                {monthEvents.map((event) => (
                  <li key={event.id} className="flex min-w-0 gap-2">
                    <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">
                      {event.day}.
                    </span>
                    <Link
                      href={`/hendelser/${event.id}`}
                      className="truncate hover:underline"
                    >
                      {event.title}
                    </Link>
                    {event.recurrence === "NONE" && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {event.year}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
