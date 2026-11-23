"use server"

import { revalidatePath } from "next/cache"

import { toActionResult } from "@/lib/action-result"
import {
  addGiftWishes,
  createEvent as createEventService,
  createGiftList as createGiftListService,
  deleteEvent as deleteEventService,
  updateEvent as updateEventService,
  type CreateEventInput,
  type UpdateEventInput,
} from "@/lib/application/events/write"
import { updateShoppingList } from "@/lib/application/shopping/write"
import { requireHousehold } from "@/lib/session"

// Thin adapters: the browser context comes from the session, the rules and the
// ownership boundary live in the event services shared with MCP.
//
// Form actions return the service's message instead of throwing (see
// `lib/action-result.ts`), so the form can say what was wrong.

function revalidateEvents(eventId?: string) {
  revalidatePath("/hendelser")
  revalidatePath("/")
  if (eventId) revalidatePath(`/hendelser/${eventId}`)
}

function revalidateGiftLists(eventId: string, listId?: string) {
  revalidateEvents(eventId)
  revalidatePath("/lists")
  if (listId) revalidatePath(`/lists/${listId}`)
}

export async function createEvent(input: CreateEventInput) {
  const { context } = await requireHousehold()
  const result = await toActionResult(async () => {
    const event = await createEventService(context, input)
    return { id: event.id }
  })

  if (result.ok) revalidateEvents()
  return result
}

export async function updateEvent(input: { id: string } & UpdateEventInput) {
  const { context } = await requireHousehold()
  const { id, ...fields } = input
  const result = await toActionResult(async () => {
    const event = await updateEventService(context, id, fields)
    return { id: event.id }
  })

  if (result.ok) revalidateEvents(id)
  return result
}

export async function deleteEvent(eventId: string) {
  const { context } = await requireHousehold()
  await deleteEventService(context, eventId)

  revalidateEvents(eventId)
  revalidatePath("/lists")
}

export async function createGiftList(input: {
  eventId: string
  name?: string
  isPrivate?: boolean
}) {
  const { context } = await requireHousehold()
  const list = await createGiftListService(context, input.eventId, {
    name: input.name,
    isPrivate: input.isPrivate,
  })

  revalidateGiftLists(input.eventId, list.id)
  return { id: list.id }
}

/** One gift wish from the event page; creates the gift list when needed. */
export async function addGiftWish(input: {
  eventId: string
  name: string
  estimatedPrice?: number | null
  url?: string | null
  description?: string | null
}) {
  const { context } = await requireHousehold()
  const { eventId, ...item } = input
  const result = await toActionResult(async () => {
    const added = await addGiftWishes(context, eventId, [item])
    return {
      listId: added.list.id,
      createdList: added.createdList,
      skipped: added.skipped.length > 0,
    }
  })

  if (result.ok) revalidateGiftLists(eventId, result.data.listId)
  return result
}

/** Links an existing list to the event, or unlinks it with `null`. */
export async function setGiftListEvent(input: {
  listId: string
  eventId: string | null
  /** The event the list was on, so its page is refreshed when unlinking. */
  previousEventId?: string | null
}) {
  const { context } = await requireHousehold()
  await updateShoppingList(context, input.listId, { eventId: input.eventId })

  for (const eventId of [input.eventId, input.previousEventId]) {
    if (eventId) revalidateGiftLists(eventId, input.listId)
  }
}
