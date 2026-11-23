import { z } from "zod"

import { osloToday } from "../../application/events/dates"
import { sessionHasScope } from "../auth/session"
import {
  addGiftWishes,
  createEvent,
  deleteEvent,
  parseEventDate,
  updateEvent,
} from "../../application/events/write"
import { ApplicationError } from "../../application/errors"
import { MAX_BATCH_SIZE } from "../../application/mutations"
import { MAX_ALTERNATIVES_PER_ITEM } from "../../application/shopping/write"
import {
  CREATE_ANNOTATIONS,
  DELETE_ANNOTATIONS,
  defineWriteTool,
  UPDATE_ANNOTATIONS,
} from "./define"
import {
  describeOccurrence,
  eventCardSchema,
  serializeEventCard,
} from "./events"
import {
  EVENT_RECURRENCES,
  EVENT_TYPES,
  expectedUpdatedAtSchema,
  idSchema,
  longTextInputSchema,
  nameInputSchema,
  parseExpectedUpdatedAt,
} from "./shared"
import {
  serializeShoppingItem,
  serializeShoppingListSummary,
  shoppingItemSchema,
  shoppingListSummarySchema,
} from "./shopping"
import {
  alternativeFieldsInputSchema,
  itemFieldsInputSchema,
} from "./shopping-write"

const eventDateInputSchema = z
  .string()
  .regex(
    /^(\d{4}|-)-\d{2}-\d{2}$/,
    "Bruk YYYY-MM-DD, eller --MM-DD når året er ukjent"
  )
  .describe(
    "The date as YYYY-MM-DD. For a birthday use the birth date; when the birth year is unknown, use --MM-DD (e.g. --03-14)."
  )

const eventFieldsInputSchema = {
  type: z
    .enum(EVENT_TYPES)
    .optional()
    .describe(
      "BIRTHDAY (title is the person's name), ANNIVERSARY (wedding day and other yearly milestones), HOLIDAY or OTHER. Defaults to BIRTHDAY on create."
    ),
  recurrence: z
    .enum(EVENT_RECURRENCES)
    .optional()
    .describe(
      "YEARLY repeats every year on the same day; NONE happens once and needs a year. Defaults to YEARLY on create."
    ),
  notes: longTextInputSchema.describe(
    "Free text, e.g. sizes, interests or what they got last year."
  ),
}

function dateFields(date: string | undefined) {
  return date === undefined ? {} : parseEventDate(date)
}

export function createEventWriteTools(now: () => Date = () => new Date()) {
  const today = () => osloToday(now())

  const createEventTool = defineWriteTool({
    name: "create-event",
    scope: "events:write",
    title: "Create a calendar event",
    description:
      "Adds a birthday, anniversary or other date to the household's calendar. Check list-events first so the same person is not added twice. Add gift wishes afterwards with add-gift-wishes. Returns the saved event with its next occurrence.",
    inputSchema: {
      title: nameInputSchema.describe(
        "For a birthday the person's name, e.g. 'Mormor' or 'Ola'."
      ),
      date: eventDateInputSchema,
      ...eventFieldsInputSchema,
    },
    outputSchema: { event: eventCardSchema },
    annotations: CREATE_ANNOTATIONS,
    resourceType: "calendar_event",
    handler: async (args, session) => {
      const { date, ...fields } = args
      const parsed = parseEventDate(date)
      const event = await createEvent(session.context, {
        ...fields,
        ...parsed,
      })
      const card = serializeEventCard(event, today())

      return {
        structuredContent: { event: card },
        summary: `Opprettet hendelsen ${describeOccurrence(event.title, card.nextOccurrence)}.`,
        resourceId: event.id,
      }
    },
  })

  const updateEventTool = defineWriteTool({
    name: "update-event",
    scope: "events:write",
    title: "Update a calendar event",
    description:
      "Changes the given fields of one event and leaves the rest as they are; null clears notes. A new date replaces day, month and year together (--MM-DD clears the year). Returns the saved event.",
    inputSchema: {
      eventId: idSchema.describe("Id from list-events."),
      title: nameInputSchema.optional(),
      date: eventDateInputSchema.optional(),
      ...eventFieldsInputSchema,
      expectedUpdatedAt: expectedUpdatedAtSchema,
    },
    outputSchema: { event: eventCardSchema },
    annotations: UPDATE_ANNOTATIONS,
    resourceType: "calendar_event",
    handler: async (args, session) => {
      const { eventId, date, expectedUpdatedAt, ...fields } = args
      const event = await updateEvent(session.context, eventId, {
        ...fields,
        ...dateFields(date),
        expectedUpdatedAt: parseExpectedUpdatedAt(expectedUpdatedAt),
      })

      return {
        structuredContent: { event: serializeEventCard(event, today()) },
        summary: `Oppdaterte hendelsen ${event.title}.`,
        resourceId: event.id,
      }
    },
  })

  const deleteEventTool = defineWriteTool({
    name: "delete-event",
    scope: "events:write",
    title: "Delete a calendar event",
    description:
      "Permanently removes one event. Its gift lists stay under shopping, unlinked. Delete only mistakes and duplicates, and confirm with the user first.",
    inputSchema: {
      eventId: idSchema.describe("Id from list-events."),
    },
    outputSchema: {
      deleted: z.object({ id: z.string(), title: z.string() }),
    },
    annotations: DELETE_ANNOTATIONS,
    resourceType: "calendar_event",
    handler: async (args, session) => {
      const deleted = await deleteEvent(session.context, args.eventId)

      return {
        structuredContent: { deleted },
        summary: `Slettet hendelsen ${deleted.title}.`,
        resourceId: deleted.id,
      }
    },
  })

  /**
   * Gift wishes are shopping items, so writing them takes the shopping write
   * scope. The tool is listed under events because that is where an assistant
   * looks for it; the event itself is only read.
   */
  const addGiftWishesTool = defineWriteTool({
    name: "add-gift-wishes",
    scope: "shopping:write",
    title: "Add gift wishes to an event",
    description: `Adds 1–${MAX_BATCH_SIZE} gift wishes for a birthday or other event. They are shopping items on the event's gift list, which is created ("Gaver til <name>") when the event has none, so they show up under Innkjøp to be bought. Names already on the list are skipped. Use alternatives for concrete products and shops for the same wish. Mark bought gifts with set-shopping-item-status.`,
    inputSchema: {
      eventId: idSchema.describe("Id from list-events."),
      listId: idSchema
        .optional()
        .describe(
          "A gift list already linked to the event (from get-event). Defaults to its first list."
        ),
      isPrivate: z
        .boolean()
        .optional()
        .describe(
          "If a new gift list is created: make it visible only to you, e.g. to keep a surprise from another household member."
        ),
      items: z
        .array(
          z.object({
            name: nameInputSchema,
            ...itemFieldsInputSchema,
            alternatives: z
              .array(
                z.object({
                  name: nameInputSchema,
                  ...alternativeFieldsInputSchema,
                })
              )
              .max(MAX_ALTERNATIVES_PER_ITEM)
              .optional(),
          })
        )
        .min(1)
        .max(MAX_BATCH_SIZE),
      onDuplicate: z
        .enum(["skip", "create"])
        .optional()
        .describe('Defaults to "skip".'),
    },
    outputSchema: {
      list: shoppingListSummarySchema,
      createdList: z.boolean(),
      created: z.array(shoppingItemSchema),
      skipped: z.array(
        z.object({ name: z.string(), existingItemId: z.string() })
      ),
    },
    annotations: CREATE_ANNOTATIONS,
    resourceType: "shopping_list",
    handler: async (args, session) => {
      if (!sessionHasScope(session, "events:read")) {
        // The event is read to find or name the list.
        throw new ApplicationError(
          "SCOPE_REQUIRED",
          "Gaveønsker krever også tilgang til hendelser (events:read)."
        )
      }
      const result = await addGiftWishes(
        session.context,
        args.eventId,
        args.items,
        {
          listId: args.listId,
          isPrivate: args.isPrivate,
          onDuplicate: args.onDuplicate ?? "skip",
        }
      )

      return {
        structuredContent: {
          list: serializeShoppingListSummary(result.list),
          createdList: result.createdList,
          created: result.created.map((item) =>
            serializeShoppingItem(item, true)
          ),
          skipped: result.skipped,
        },
        summary:
          `La til ${result.created.length} gaveønske(r) på ${result.list.name}` +
          (result.createdList ? " (ny liste)" : "") +
          (result.skipped.length > 0
            ? `; hoppet over ${result.skipped.length} som allerede fantes.`
            : "."),
        resourceId: result.list.id,
      }
    },
  })

  return [createEventTool, updateEventTool, deleteEventTool, addGiftWishesTool]
}
