import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarDays, Repeat, StickyNote } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import { nextOccurrence, osloToday } from "@/lib/application/events/dates"
import {
  getEvent,
  listUnlinkedGiftLists,
  type GiftList,
} from "@/lib/application/events/read"
import {
  EVENT_RECURRENCE_LABELS,
  EVENT_TYPE_CONFIG,
  describeOccurrence,
  formatEventDay,
  formatIsoDay,
} from "@/lib/event-labels"
import { summarizeShoppingList } from "@/lib/project-purchases"
import { requireHousehold } from "@/lib/session"
import { EventActions } from "./event-actions"
import { GiftsSection, type GiftListView } from "./gifts-section"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface EventPageProps {
  params: Promise<{ id: string }>
}

/** Decimals cannot cross into a client component; prices become numbers. */
function toGiftListView(list: GiftList): GiftListView {
  return {
    id: list.id,
    name: list.name,
    isPrivate: list.isPrivate,
    summary: summarizeShoppingList(list.items),
    items: list.items.map((item) => {
      const preferred = item.alternatives[0]?.price
      const price =
        preferred != null
          ? Number(preferred)
          : item.estimatedPrice != null
            ? Number(item.estimatedPrice)
            : null
      return {
        id: item.id,
        name: item.name,
        status: item.status,
        price,
        url: item.url,
        storeName: item.storeName,
      }
    }),
  }
}

export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params
  // A malformed id would make the UUID column query throw.
  if (!UUID_PATTERN.test(id)) notFound()

  const { context } = await requireHousehold()
  const [event, unlinkedLists] = await Promise.all([
    getEvent(context, id),
    listUnlinkedGiftLists(context),
  ])
  if (!event) notFound()

  const type = EVENT_TYPE_CONFIG[event.type]
  const next = nextOccurrence(event, osloToday())

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/hendelser"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Hendelser
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-heading text-2xl font-bold tracking-tight break-words">
            {event.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className={cn("text-xs", type.className)}
            >
              {type.label}
            </Badge>
            {next && (
              <span className="text-sm text-muted-foreground">
                {formatIsoDay(next.date)} ·{" "}
                {describeOccurrence(event.type, next)}
              </span>
            )}
          </div>
        </div>
        <EventActions
          event={{
            id: event.id,
            title: event.title,
            type: event.type,
            recurrence: event.recurrence,
            month: event.month,
            day: event.day,
            year: event.year,
            notes: event.notes,
          }}
        />
      </div>

      <Card size="sm">
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              {formatEventDay(event.day, event.month, event.year)}
              {event.type === "BIRTHDAY" &&
                event.recurrence === "YEARLY" &&
                !event.year && (
                  <span className="text-muted-foreground">
                    {" "}
                    (fødselsår ikke oppgitt)
                  </span>
                )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              {EVENT_RECURRENCE_LABELS[event.recurrence]}
              {!next && (
                <span className="text-muted-foreground"> · har vært</span>
              )}
            </span>
          </div>
          {event.notes && (
            <div className="flex items-start gap-2">
              <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="whitespace-pre-wrap">{event.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <GiftsSection
        eventId={event.id}
        lists={event.shoppingLists.map(toGiftListView)}
        unlinkedLists={unlinkedLists}
      />
    </div>
  )
}
