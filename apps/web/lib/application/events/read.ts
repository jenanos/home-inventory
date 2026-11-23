import {
  db,
  type CalendarEventRecurrence,
  type CalendarEventType,
  type Prisma,
} from "@workspace/db"

import { getVisibleShoppingListsWhere } from "../../shopping-list-access"
import type { ApplicationContext } from "../context"
import {
  daysBetween,
  nextOccurrence,
  occurrencesBetween,
  yearsAt,
  type EventOccurrence,
} from "./dates"

/**
 * Gift lists are filtered by the list visibility rule, so an event never
 * reveals another member's private list. That is also how a surprise stays a
 * surprise: make the gift list private.
 */
function giftListsSelect(context: ApplicationContext) {
  return {
    where: getVisibleShoppingListsWhere(context.householdId, context.userId),
    select: {
      id: true,
      name: true,
      color: true,
      isPrivate: true,
      updatedAt: true,
      items: {
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          priority: true,
          estimatedPrice: true,
          url: true,
          storeName: true,
          updatedAt: true,
          alternatives: {
            select: { price: true },
            orderBy: [{ rank: "asc" as const }, { id: "asc" as const }],
            take: 1,
          },
        },
        orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
      },
    },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  } satisfies Prisma.CalendarEvent$shoppingListsArgs
}

function eventInclude(context: ApplicationContext) {
  return {
    shoppingLists: giftListsSelect(context),
  } satisfies Prisma.CalendarEventInclude
}

export type CalendarEventWithGifts = Prisma.CalendarEventGetPayload<{
  include: ReturnType<typeof eventInclude>
}>

export type GiftList = CalendarEventWithGifts["shoppingLists"][number]

export async function listEvents(
  context: ApplicationContext
): Promise<CalendarEventWithGifts[]> {
  return db.calendarEvent.findMany({
    where: { householdId: context.householdId },
    include: eventInclude(context),
    orderBy: [
      { month: "asc" },
      { day: "asc" },
      { title: "asc" },
      { id: "asc" },
    ],
  })
}

export async function getEvent(
  context: ApplicationContext,
  eventId: string
): Promise<CalendarEventWithGifts | null> {
  return db.calendarEvent.findFirst({
    where: { id: eventId, householdId: context.householdId },
    include: eventInclude(context),
  })
}

/** Events a shopping list can be linked to, for pickers in the web flow. */
export async function listEventOptions(context: ApplicationContext) {
  return db.calendarEvent.findMany({
    where: { householdId: context.householdId },
    select: { id: true, title: true, type: true },
    orderBy: [{ title: "asc" }, { id: "asc" }],
  })
}

/** Visible lists not linked to any event, for "link an existing list". */
export async function listUnlinkedGiftLists(context: ApplicationContext) {
  return db.shoppingList.findMany({
    where: {
      ...getVisibleShoppingListsWhere(context.householdId, context.userId),
      eventId: null,
    },
    select: { id: true, name: true, isPrivate: true },
    orderBy: { name: "asc" },
  })
}

// ─── Upcoming ───────────────────────────────────────────────────

export type UpcomingEvent = {
  event: CalendarEventWithGifts
  occurrence: EventOccurrence
}

/**
 * Events in the order they next fall on, from `today`. A household has tens
 * of events, not thousands, so the date arithmetic runs here rather than in
 * SQL.
 */
export async function listUpcomingEvents(
  context: ApplicationContext,
  today: string,
  options: { withinDays?: number; limit?: number } = {}
): Promise<UpcomingEvent[]> {
  const events = await listEvents(context)
  return upcomingFrom(events, today, options)
}

export function upcomingFrom(
  events: CalendarEventWithGifts[],
  today: string,
  { withinDays, limit }: { withinDays?: number; limit?: number } = {}
): UpcomingEvent[] {
  const upcoming = events
    .map((event) => ({ event, occurrence: nextOccurrence(event, today) }))
    .filter(
      (entry): entry is UpcomingEvent =>
        entry.occurrence !== null &&
        (withinDays === undefined || entry.occurrence.daysUntil <= withinDays)
    )
    .sort(
      (a, b) =>
        a.occurrence.daysUntil - b.occurrence.daysUntil ||
        a.event.title.localeCompare(b.event.title, "nb-NO")
    )

  return limit === undefined ? upcoming : upcoming.slice(0, limit)
}

// ─── Paged reads ────────────────────────────────────────────────

export type EventFilter = {
  /** Substring of the title or notes. */
  query?: string
  type?: CalendarEventType
  recurrence?: CalendarEventRecurrence
  /** With `to`: only events that fall in the range, once per occurrence. */
  from?: string
  to?: string
}

export type EventListEntry = {
  event: CalendarEventWithGifts
  /** The occurrence in the range, or the next one when no range was given. */
  occurrence: EventOccurrence | null
}

/**
 * Without a range: every matching event, in the order they next fall on, past
 * one-off events last. With `from` and `to`: one row per occurrence in the
 * range, in date order, so a yearly event can appear twice in a long range.
 */
export async function listEventsPage(
  context: ApplicationContext,
  today: string,
  options: EventFilter & { limit: number; offset: number }
) {
  const contains = options.query
    ? ({ contains: options.query, mode: "insensitive" } as const)
    : undefined
  const events = await db.calendarEvent.findMany({
    where: {
      householdId: context.householdId,
      ...(options.type ? { type: options.type } : {}),
      ...(options.recurrence ? { recurrence: options.recurrence } : {}),
      ...(contains ? { OR: [{ title: contains }, { notes: contains }] } : {}),
    },
    include: eventInclude(context),
    orderBy: [{ title: "asc" }, { id: "asc" }],
  })

  let entries: EventListEntry[]

  if (options.from && options.to) {
    const from = options.from
    const to = options.to
    entries = events
      .flatMap((event) =>
        occurrencesBetween(event, from, to).map((date) => ({
          event,
          occurrence: {
            date,
            daysUntil: daysBetween(today, date),
            years: yearsAt(event, date),
          },
        }))
      )
      .sort(
        (a, b) =>
          a.occurrence.date.localeCompare(b.occurrence.date) ||
          a.event.title.localeCompare(b.event.title, "nb-NO")
      )
  } else {
    entries = events
      .map((event) => ({ event, occurrence: nextOccurrence(event, today) }))
      .sort((a, b) => {
        const left = a.occurrence?.daysUntil ?? Number.POSITIVE_INFINITY
        const right = b.occurrence?.daysUntil ?? Number.POSITIVE_INFINITY
        return (
          left - right || a.event.title.localeCompare(b.event.title, "nb-NO")
        )
      })
  }

  return {
    totalCount: entries.length,
    entries: entries.slice(options.offset, options.offset + options.limit),
  }
}
