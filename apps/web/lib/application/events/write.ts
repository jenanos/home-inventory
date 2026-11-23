import {
  db,
  CalendarEventRecurrence,
  CalendarEventType,
  type Prisma,
} from "@workspace/db"

import { getVisibleShoppingListsWhere } from "../../shopping-list-access"
import type { ApplicationContext } from "../context"
import {
  MAX_LONG_TEXT_LENGTH,
  assertBatchSize,
  definedFields,
  enumValue,
  freshness,
  integerInRange,
  notFound,
  optionalText,
  requiredText,
  scopedWrite,
  validationError,
} from "../mutations"
import {
  insertShoppingItems,
  SHOPPING_LIST_RESULT_SELECT,
  type AddShoppingItemsResult,
  type NewShoppingItem,
} from "../shopping/write"
import { isLeapYear, isValidDayOfMonth, parseDay } from "./dates"
import { getEvent, type CalendarEventWithGifts } from "./read"

/**
 * Event write services, shared by the web actions and the MCP tools. Every
 * write carries the household in its `where`; a miss is NOT_FOUND whether the
 * id is unknown or belongs to another household.
 */

const RESOURCE = "hendelse"

const TYPE_VALUES = Object.values(CalendarEventType)
const RECURRENCE_VALUES = Object.values(CalendarEventRecurrence)

/** Years a person can plausibly be born in or an event be planned for. */
const MIN_YEAR = 1900
const MAX_YEAR = 2200

const BATCH_TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 }

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertResourceId(value: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw notFound(RESOURCE)
  }
  return value
}

/**
 * The date is given either as parts or, from MCP, as `date: "YYYY-MM-DD"`
 * (with `--MM-DD` meaning "year unknown"). `undefined` leaves a field alone on
 * update.
 */
export type EventFields = {
  title: string
  type?: CalendarEventType
  recurrence?: CalendarEventRecurrence
  month?: number
  day?: number
  /** `null` clears the year (only for yearly events). */
  year?: number | null
  notes?: string | null
}

export type CreateEventInput = EventFields & { month: number; day: number }

export type UpdateEventInput = Partial<EventFields> & {
  expectedUpdatedAt?: Date
}

/** Accepts `YYYY-MM-DD`, or `--MM-DD` for a yearly date without a year. */
export function parseEventDate(value: string) {
  const withoutYear = /^--(\d{2})-(\d{2})$/.exec(value)
  if (withoutYear) {
    return {
      year: null,
      month: Number(withoutYear[1]),
      day: Number(withoutYear[2]),
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError("Dato må ha formatet YYYY-MM-DD eller --MM-DD.")
  }
  return parseDay(value)
}

function normalizeFields(input: Partial<EventFields>) {
  return definedFields({
    title:
      input.title === undefined ? undefined : requiredText(input.title, "Navn"),
    type:
      input.type === undefined
        ? undefined
        : enumValue(input.type, TYPE_VALUES, "Type"),
    recurrence:
      input.recurrence === undefined
        ? undefined
        : enumValue(input.recurrence, RECURRENCE_VALUES, "Gjentakelse"),
    month:
      input.month === undefined
        ? undefined
        : integerInRange(input.month, "Måned", { min: 1, max: 12 }),
    day:
      input.day === undefined
        ? undefined
        : integerInRange(input.day, "Dag", { min: 1, max: 31 }),
    year:
      input.year == null
        ? input.year
        : integerInRange(input.year, "År", { min: MIN_YEAR, max: MAX_YEAR }),
    notes: optionalText(input.notes, "Notater", MAX_LONG_TEXT_LENGTH),
  })
}

/** The rules that span fields, checked on the row as it will be saved. */
function assertConsistentDate(event: {
  recurrence: CalendarEventRecurrence
  month: number
  day: number
  year: number | null
}) {
  if (!isValidDayOfMonth(event.month, event.day)) {
    throw validationError("Datoen finnes ikke.")
  }
  if (event.recurrence === "NONE" && event.year === null) {
    throw validationError("En hendelse som ikke gjentas må ha et år.")
  }
  if (
    event.recurrence === "NONE" &&
    event.month === 2 &&
    event.day === 29 &&
    event.year !== null &&
    !isLeapYear(event.year)
  ) {
    throw validationError("Datoen finnes ikke.")
  }
}

export async function createEvent(
  context: ApplicationContext,
  input: CreateEventInput
): Promise<CalendarEventWithGifts> {
  const fields = normalizeFields(input)
  const row = {
    title: requiredText(input.title, "Navn"),
    type: fields.type ?? "BIRTHDAY",
    recurrence: fields.recurrence ?? "YEARLY",
    month: integerInRange(input.month, "Måned", { min: 1, max: 12 }),
    day: integerInRange(input.day, "Dag", { min: 1, max: 31 }),
    year: fields.year ?? null,
    notes: fields.notes ?? null,
  }
  assertConsistentDate(row)

  const created = await db.calendarEvent.create({
    data: { ...row, householdId: context.householdId },
    select: { id: true },
  })

  return (await getEvent(context, created.id))!
}

export async function updateEvent(
  context: ApplicationContext,
  eventId: string,
  input: UpdateEventInput
): Promise<CalendarEventWithGifts> {
  assertResourceId(eventId)
  const { expectedUpdatedAt, ...rest } = input
  const fields = normalizeFields(rest)
  const scope = { id: eventId, householdId: context.householdId }

  await scopedWrite({
    resource: RESOURCE,
    expectedUpdatedAt,
    write: () =>
      db.$transaction(async (tx) => {
        const updated = await tx.calendarEvent.update({
          where: { ...scope, ...freshness(expectedUpdatedAt) },
          data: fields,
          select: { recurrence: true, month: true, day: true, year: true },
        })
        // Checked after the write, inside the transaction, so a partial update
        // is validated against the row it actually changed.
        assertConsistentDate(updated)
        return updated
      }),
    existsInScope: async () =>
      (await db.calendarEvent.count({ where: scope })) > 0,
  })

  return (await getEvent(context, eventId))!
}

export async function deleteEvent(
  context: ApplicationContext,
  eventId: string
) {
  assertResourceId(eventId)
  return scopedWrite({
    resource: RESOURCE,
    write: () =>
      db.calendarEvent.delete({
        where: { id: eventId, householdId: context.householdId },
        select: { id: true, title: true },
      }),
  })
}

// ─── Gift wishes ────────────────────────────────────────────────

/** "Gaver til Mormor"; an anniversary or other event keeps its own title. */
export function defaultGiftListName(event: {
  title: string
  type: CalendarEventType
}) {
  return event.type === "BIRTHDAY"
    ? `Gaver til ${event.title}`
    : `Gaver: ${event.title}`
}

/**
 * Creates a shopping list for the event's gift wishes. The list is an ordinary
 * shopping list, so it shows up under Innkjøp and can be made private.
 */
export async function createGiftList(
  context: ApplicationContext,
  eventId: string,
  input: { name?: string; isPrivate?: boolean } = {}
) {
  assertResourceId(eventId)
  if (input.isPrivate !== undefined && typeof input.isPrivate !== "boolean") {
    throw validationError("Privat må være sann eller usann.")
  }

  return db.$transaction(async (tx) => {
    const event = await tx.calendarEvent.findFirst({
      where: { id: eventId, householdId: context.householdId },
      select: { id: true, title: true, type: true },
    })
    if (!event) throw notFound(RESOURCE)

    return tx.shoppingList.create({
      data: {
        name: input.name
          ? requiredText(input.name, "Navn")
          : defaultGiftListName(event),
        isPrivate: input.isPrivate ?? false,
        householdId: context.householdId,
        createdById: context.userId,
        eventId: event.id,
      },
      select: SHOPPING_LIST_RESULT_SELECT,
    })
  })
}

export type AddGiftWishesResult = AddShoppingItemsResult & {
  list: Prisma.ShoppingListGetPayload<{
    select: typeof SHOPPING_LIST_RESULT_SELECT
  }>
  /** Whether the call created the gift list. */
  createdList: boolean
}

/**
 * Adds gift wishes to an event: to the given list, which must be linked to the
 * event, or else to the first gift list the caller can see, created when there
 * is none. Names already on the list are skipped, like add-shopping-items.
 */
export async function addGiftWishes(
  context: ApplicationContext,
  eventId: string,
  items: NewShoppingItem[],
  options: {
    listId?: string
    onDuplicate?: "skip" | "create"
    /** For a new list: make it private. */
    isPrivate?: boolean
  } = {}
): Promise<AddGiftWishesResult> {
  assertResourceId(eventId)
  assertBatchSize(items.length, "Gaveønsker")
  if (options.listId !== undefined && !UUID_PATTERN.test(options.listId)) {
    throw notFound("gaveliste")
  }

  return db.$transaction(async (tx) => {
    const event = await tx.calendarEvent.findFirst({
      where: { id: eventId, householdId: context.householdId },
      select: { id: true, title: true, type: true },
    })
    if (!event) throw notFound(RESOURCE)

    const visible = getVisibleShoppingListsWhere(
      context.householdId,
      context.userId
    )
    let list = await tx.shoppingList.findFirst({
      where: {
        ...visible,
        eventId: event.id,
        ...(options.listId ? { id: options.listId } : {}),
      },
      select: SHOPPING_LIST_RESULT_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })

    if (!list && options.listId) throw notFound("gaveliste")

    let createdList = false
    if (!list) {
      list = await tx.shoppingList.create({
        data: {
          name: defaultGiftListName(event),
          isPrivate: options.isPrivate ?? false,
          householdId: context.householdId,
          createdById: context.userId,
          eventId: event.id,
        },
        select: SHOPPING_LIST_RESULT_SELECT,
      })
      createdList = true
    }

    const result = await insertShoppingItems(tx, context, list.id, items, {
      onDuplicate: options.onDuplicate ?? "skip",
    })

    return { ...result, list, createdList }
  }, BATCH_TRANSACTION_OPTIONS)
}
