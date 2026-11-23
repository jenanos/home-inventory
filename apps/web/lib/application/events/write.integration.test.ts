import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createToolRegistry } from "../../mcp/tools"
import { createHouseholdFixtures } from "../../test/household-fixtures"
import { createShoppingList, setShoppingListPrivacy } from "../shopping/write"
import { getEvent, listEvents } from "./read"
import {
  addGiftWishes,
  createEvent,
  createGiftList,
  deleteEvent,
  updateEvent,
} from "./write"

const fixtures = createHouseholdFixtures()
const registry = createToolRegistry(() => new Date("2026-08-03T09:00:00Z"))

afterAll(async () => {
  await fixtures.cleanup()
  await db.$disconnect()
})

function tool(name: string) {
  const found = registry.find((entry) => entry.name === name)
  if (!found) throw new Error(`Unknown tool ${name}`)
  return found
}

describe("event write service", () => {
  it("creates a yearly birthday by default", async () => {
    const { context, householdId } = await fixtures.createHousehold()

    const event = await createEvent(context, {
      title: " Mormor ",
      month: 8,
      day: 20,
      year: 1946,
    })

    expect(event).toMatchObject({
      title: "Mormor",
      type: "BIRTHDAY",
      recurrence: "YEARLY",
      householdId,
      shoppingLists: [],
    })
  })

  it("rejects a day that does not exist and a one-off event without a year", async () => {
    const { context } = await fixtures.createHousehold()

    await expect(
      createEvent(context, { title: "Feil", month: 4, day: 31 })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(
      createEvent(context, {
        title: "Konfirmasjon",
        month: 5,
        day: 10,
        recurrence: "NONE",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("validates a partial update against the saved row and rolls it back", async () => {
    const { context } = await fixtures.createHousehold()
    const event = await createEvent(context, {
      title: "Ola",
      month: 3,
      day: 31,
    })

    await expect(
      updateEvent(context, event.id, { month: 2 })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    })
    expect((await getEvent(context, event.id))?.month).toBe(3)
  })

  it("rejects a stale update with CONFLICT", async () => {
    const { context } = await fixtures.createHousehold()
    const event = await createEvent(context, { title: "Ola", month: 3, day: 1 })
    await updateEvent(context, event.id, { notes: "Liker Lego" })

    await expect(
      updateEvent(context, event.id, {
        notes: "Overskriver",
        expectedUpdatedAt: event.updatedAt,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("keeps another household's events out of reach", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const event = await createEvent(owner.context, {
      title: "Mormor",
      month: 8,
      day: 20,
    })

    expect(await getEvent(other.context, event.id)).toBeNull()
    await expect(
      updateEvent(other.context, event.id, { title: "Kapret" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(deleteEvent(other.context, event.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(
      addGiftWishes(other.context, event.id, [{ name: "Blomster" }])
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      createShoppingList(other.context, { name: "Gaver", eventId: event.id })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("creates the gift list on the first wish and reuses it", async () => {
    const { context } = await fixtures.createHousehold()
    const event = await createEvent(context, {
      title: "Mormor",
      month: 8,
      day: 20,
    })

    const first = await addGiftWishes(context, event.id, [
      { name: "Lyngplante", estimatedPrice: 249 },
    ])
    const second = await addGiftWishes(context, event.id, [
      { name: "lyngplante" },
      { name: "Sjokolade" },
    ])

    expect(first).toMatchObject({
      createdList: true,
      list: { name: "Gaver til Mormor", eventId: event.id },
    })
    expect(second.createdList).toBe(false)
    expect(second.list.id).toBe(first.list.id)
    expect(second.created.map((item) => item.name)).toEqual(["Sjokolade"])
    expect(second.skipped).toEqual([
      { name: "lyngplante", existingItemId: first.created[0]!.id },
    ])
  })

  it("hides another member's private gift list from the event", async () => {
    const { context, householdId } = await fixtures.createHousehold()
    const partner = await fixtures.addMember(householdId)
    const event = await createEvent(context, {
      title: "Partner",
      month: 1,
      day: 2,
    })
    const list = await createGiftList(context, event.id)
    await setShoppingListPrivacy(context, list.id, true)

    expect((await getEvent(context, event.id))?.shoppingLists).toHaveLength(1)
    expect((await getEvent(partner, event.id))?.shoppingLists).toEqual([])
    // A wish from the partner goes on a list of their own, not the hidden one.
    const result = await addGiftWishes(partner, event.id, [{ name: "Bok" }])
    expect(result.createdList).toBe(true)
    expect(result.list.id).not.toBe(list.id)
  })

  it("keeps the gift list when the event is deleted", async () => {
    const { context } = await fixtures.createHousehold()
    const event = await createEvent(context, { title: "Ola", month: 3, day: 1 })
    const list = await createGiftList(context, event.id, { name: "Ola 10 år" })

    await deleteEvent(context, event.id)

    expect(
      await db.shoppingList.findUnique({ where: { id: list.id } })
    ).toMatchObject({ name: "Ola 10 år", eventId: null })
    expect(await listEvents(context)).toEqual([])
  })
})

describe("event MCP tools", () => {
  it("creates an event from a date without a year and lists it as upcoming", async () => {
    const { context } = await fixtures.createHousehold()
    const session = fixtures.session(context, ["events:write"])

    const created = await tool("create-event").invoke(
      { title: "Bestefar", date: "--08-10" },
      session
    )
    expect(created.isError).toBeUndefined()
    expect(created.structuredContent).toMatchObject({
      event: {
        date: "--08-10",
        year: null,
        nextOccurrence: { date: "2026-08-10", daysUntil: 7, years: null },
      },
    })

    const listed = await tool("list-events").invoke({ withinDays: 30 }, session)
    expect(listed.structuredContent).toMatchObject({
      today: "2026-08-03",
      events: [{ title: "Bestefar", occurrence: { date: "2026-08-10" } }],
    })
  })

  it("adds gift wishes only with both shopping:write and events access", async () => {
    const { context } = await fixtures.createHousehold()
    const event = await createEvent(context, {
      title: "Mormor",
      month: 8,
      day: 20,
      year: 1946,
    })

    const withoutEvents = await tool("add-gift-wishes").invoke(
      { eventId: event.id, items: [{ name: "Bok" }] },
      fixtures.session(context, ["shopping:write"])
    )
    expect(withoutEvents.structuredContent).toMatchObject({
      error: { code: "SCOPE_REQUIRED" },
    })

    const added = await tool("add-gift-wishes").invoke(
      { eventId: event.id, items: [{ name: "Bok", estimatedPrice: 199 }] },
      fixtures.session(context, ["shopping:write", "events:read"])
    )
    expect(added.structuredContent).toMatchObject({
      createdList: true,
      list: { eventId: event.id },
      created: [{ name: "Bok" }],
    })

    const card = await tool("get-event").invoke(
      { eventId: event.id },
      fixtures.session(context, ["events:read"])
    )
    expect(card.structuredContent).toMatchObject({
      event: {
        nextOccurrence: { years: 80 },
        giftLists: [
          {
            pendingCount: 1,
            estimatedTotal: "199.00",
            items: [{ name: "Bok", effectivePrice: "199.00" }],
          },
        ],
      },
    })
  })
})
