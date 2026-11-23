import { z } from "zod"

import {
  addDays,
  daysBetween,
  formatDay,
  nextOccurrence,
  osloToday,
  type EventOccurrence,
} from "../../application/events/dates"
import {
  getEvent,
  listEventsPage,
  type CalendarEventWithGifts,
  type GiftList,
} from "../../application/events/read"
import { ApplicationError } from "../../application/errors"
import { getShoppingListItemEffectivePrice } from "../../shopping-list-pricing"
import {
  buildPageInfo,
  pageInfoSchema,
  paginationInputSchema,
  resolvePageRequest,
} from "../pagination"
import { notFoundError, toolSuccess } from "../result"
import { defineTool, READ_ONLY_ANNOTATIONS } from "./define"
import {
  EVENT_RECURRENCES,
  EVENT_TYPES,
  ITEM_STATUSES,
  PRIORITIES,
  assertId,
  calculated,
  calendarDateSchema,
  filterTextSchema,
  idSchema,
  money,
  storedMoneySchema,
  timestamp,
  timestampSchema,
} from "./shared"

/** A range longer than this is a mistake, and its rows would not fit a page. */
const MAX_RANGE_DAYS = 2 * 366

// ─── Shapes ─────────────────────────────────────────────────────

export const occurrenceSchema = z.object({
  date: calendarDateSchema.describe("YYYY-MM-DD in the household's calendar."),
  daysUntil: z
    .number()
    .int()
    .describe("Days from today (Europe/Oslo); 0 is today, negative is past."),
  years: z
    .number()
    .int()
    .nullable()
    .describe(
      "The age the person turns, or the anniversary number. Null when the start year is unknown."
    ),
})

const giftItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(ITEM_STATUSES),
  priority: z.enum(PRIORITIES),
  estimatedPrice: storedMoneySchema,
  effectivePrice: z
    .string()
    .describe(
      "The preferred alternative's price, else the item's own estimate, in NOK."
    ),
  url: z.string().nullable(),
  storeName: z.string().nullable(),
  updatedAt: timestampSchema,
})

const giftListSchema = z.object({
  id: z
    .string()
    .describe("Shopping list id; manage it with the shopping tools."),
  name: z.string(),
  isPrivate: z
    .boolean()
    .describe("Private lists are visible only to their creator."),
  pendingCount: z.number().int(),
  purchasedCount: z.number().int(),
  estimatedTotal: z.string().describe("NOK, skipped items excluded."),
  items: z.array(giftItemSchema),
})

const giftSummarySchema = z.object({
  listCount: z.number().int(),
  pendingCount: z
    .number()
    .int()
    .describe("Gift wishes not bought yet, across the event's lists."),
  purchasedCount: z.number().int(),
})

const eventBaseShape = {
  id: z.string(),
  title: z.string().describe("For a birthday, the person's name."),
  type: z.enum(EVENT_TYPES),
  recurrence: z.enum(EVENT_RECURRENCES),
  date: z
    .string()
    .describe(
      "YYYY-MM-DD, or --MM-DD for a yearly event whose start year is unknown. For a birthday the year is the birth year."
    ),
  month: z.number().int(),
  day: z.number().int(),
  year: z.number().int().nullable(),
  notes: z.string().nullable(),
  nextOccurrence: occurrenceSchema
    .nullable()
    .describe("Null for a one-off event that has passed."),
  updatedAt: timestampSchema,
}

export const eventCardSchema = z.object({
  ...eventBaseShape,
  giftLists: z
    .array(giftListSchema)
    .describe(
      "Shopping lists with gift wishes for this event. Add wishes with add-gift-wishes."
    ),
  createdAt: timestampSchema,
})

const eventListRowSchema = z.object({
  ...eventBaseShape,
  occurrence: occurrenceSchema
    .nullable()
    .describe(
      "With from/to: the occurrence in the range (a yearly event can appear once per year). Otherwise the next occurrence."
    ),
  gifts: giftSummarySchema,
})

// ─── Serialization ──────────────────────────────────────────────

export function eventDateString(event: {
  month: number
  day: number
  year: number | null
}) {
  return event.year === null
    ? `--${String(event.month).padStart(2, "0")}-${String(event.day).padStart(2, "0")}`
    : formatDay(event.year, event.month, event.day)
}

function serializeGiftList(list: GiftList) {
  let pendingCount = 0
  let purchasedCount = 0
  let estimatedTotal = 0

  const items = list.items.map((item) => {
    const price = getShoppingListItemEffectivePrice(item)
    if (item.status !== "SKIPPED") estimatedTotal += price
    if (item.status === "PENDING") pendingCount += 1
    if (item.status === "PURCHASED") purchasedCount += 1
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      status: item.status,
      priority: item.priority,
      estimatedPrice: money(item.estimatedPrice),
      effectivePrice: calculated(price),
      url: item.url,
      storeName: item.storeName,
      updatedAt: timestamp(item.updatedAt),
    }
  })

  return {
    id: list.id,
    name: list.name,
    isPrivate: list.isPrivate,
    pendingCount,
    purchasedCount,
    estimatedTotal: calculated(estimatedTotal),
    items,
  }
}

function serializeBase(event: CalendarEventWithGifts, today: string) {
  return {
    id: event.id,
    title: event.title,
    type: event.type,
    recurrence: event.recurrence,
    date: eventDateString(event),
    month: event.month,
    day: event.day,
    year: event.year,
    notes: event.notes,
    nextOccurrence: nextOccurrence(event, today),
    updatedAt: timestamp(event.updatedAt),
  }
}

export function serializeEventCard(
  event: CalendarEventWithGifts,
  today: string
): z.infer<typeof eventCardSchema> {
  return {
    ...serializeBase(event, today),
    giftLists: event.shoppingLists.map(serializeGiftList),
    createdAt: timestamp(event.createdAt),
  }
}

function giftSummary(event: CalendarEventWithGifts) {
  const items = event.shoppingLists.flatMap((list) => list.items)
  return {
    listCount: event.shoppingLists.length,
    pendingCount: items.filter((item) => item.status === "PENDING").length,
    purchasedCount: items.filter((item) => item.status === "PURCHASED").length,
  }
}

function serializeListRow(
  event: CalendarEventWithGifts,
  occurrence: EventOccurrence | null,
  today: string
): z.infer<typeof eventListRowSchema> {
  return {
    ...serializeBase(event, today),
    occurrence,
    gifts: giftSummary(event),
  }
}

/** "Mormor fyller 80 om 12 dager", for summaries. */
export function describeOccurrence(
  title: string,
  occurrence: EventOccurrence | null
) {
  if (!occurrence) return `${title} (passert)`
  const when =
    occurrence.daysUntil === 0
      ? "i dag"
      : occurrence.daysUntil === 1
        ? "i morgen"
        : `${occurrence.date} (om ${occurrence.daysUntil} dager)`
  return occurrence.years
    ? `${title}, ${occurrence.years} år, ${when}`
    : `${title} ${when}`
}

// ─── Tools ──────────────────────────────────────────────────────

function resolveRange(
  today: string,
  args: { from?: string; to?: string; withinDays?: number }
) {
  if (args.withinDays !== undefined) {
    if (args.from || args.to) {
      throw new ApplicationError(
        "VALIDATION_ERROR",
        "Bruk enten withinDays eller from/to, ikke begge."
      )
    }
    return { from: today, to: addDays(today, args.withinDays) }
  }
  if (!args.from && !args.to) return {}
  if (!args.from || !args.to) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "from og to må angis sammen."
    )
  }
  const length = daysBetween(args.from, args.to)
  if (length < 0) {
    throw new ApplicationError("VALIDATION_ERROR", "to må være etter from.")
  }
  if (length > MAX_RANGE_DAYS) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      `Perioden kan være maks ${MAX_RANGE_DAYS} dager.`
    )
  }
  return { from: args.from, to: args.to }
}

export function createEventTools(now: () => Date = () => new Date()) {
  const listEventsTool = defineTool({
    name: "list-events",
    scope: "events:read",
    title: "List calendar events",
    description:
      "Lists the household's birthdays, anniversaries and other dates. Without a range, every event in the order it next falls on (today first, passed one-off events last). With withinDays, or from and to, one row per occurrence in that range, in date order: use it to answer 'whose birthday is coming up?' or to fill a calendar month. Each row has a gift summary; get-event shows the gift wishes themselves.",
    inputSchema: {
      query: filterTextSchema
        .optional()
        .describe("Case-insensitive substring match on the title or notes."),
      type: z.enum(EVENT_TYPES).optional(),
      recurrence: z.enum(EVENT_RECURRENCES).optional(),
      withinDays: z
        .number()
        .int()
        .min(0)
        .max(MAX_RANGE_DAYS)
        .optional()
        .describe("Only occurrences from today through this many days ahead."),
      from: calendarDateSchema
        .optional()
        .describe("Start of the range (inclusive), with to."),
      to: calendarDateSchema
        .optional()
        .describe(
          `End of the range (inclusive). At most ${MAX_RANGE_DAYS} days after from.`
        ),
      ...paginationInputSchema,
    },
    outputSchema: {
      today: calendarDateSchema.describe("Today in Europe/Oslo."),
      events: z.array(eventListRowSchema),
      pageInfo: pageInfoSchema,
    },
    annotations: READ_ONLY_ANNOTATIONS,
    handler: async (args, session) => {
      const today = osloToday(now())
      const range = resolveRange(today, args)
      const page = resolvePageRequest(args)
      const { totalCount, entries } = await listEventsPage(
        session.context,
        today,
        {
          ...page,
          query: args.query,
          type: args.type,
          recurrence: args.recurrence,
          ...range,
        }
      )
      const events = entries.map((entry) =>
        serializeListRow(entry.event, entry.occurrence, today)
      )

      return toolSuccess(
        {
          today,
          events,
          pageInfo: buildPageInfo(page, events.length, totalCount),
        },
        events.length === 0
          ? "Fant ingen hendelser."
          : `Fant ${totalCount} hendelse(r): ${entries
              .slice(0, 5)
              .map((entry) =>
                describeOccurrence(entry.event.title, entry.occurrence)
              )
              .join("; ")}${totalCount > 5 ? " …" : ""}.`
      )
    },
  })

  const getEventTool = defineTool({
    name: "get-event",
    scope: "events:read",
    title: "Get a calendar event",
    description:
      "Returns one event with its date, next occurrence (and the age the person turns, when the birth year is known), notes and the gift wishes on its linked shopping lists, with what each costs and whether it is bought.",
    inputSchema: {
      eventId: idSchema.describe("Id from list-events."),
    },
    outputSchema: {
      today: calendarDateSchema,
      event: eventCardSchema,
    },
    annotations: READ_ONLY_ANNOTATIONS,
    handler: async (args, session) => {
      assertId(args.eventId, "eventId")
      const event = await getEvent(session.context, args.eventId)
      if (!event) return notFoundError("hendelse")

      const today = osloToday(now())
      const card = serializeEventCard(event, today)
      const wishes = card.giftLists.flatMap((list) => list.items)

      return toolSuccess(
        { today, event: card },
        `${describeOccurrence(event.title, card.nextOccurrence)}. ${wishes.length} gaveønske(r), ${wishes.filter((item) => item.status === "PURCHASED").length} kjøpt.`
      )
    },
  })

  return [listEventsTool, getEventTool]
}
