import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createToolRegistry } from "../../mcp/tools"
import { createHouseholdFixtures } from "../../test/household-fixtures"
import type { ApplicationContext } from "../context"
import {
  clearShoppingItemDeal,
  listCurrentShoppingDeals,
  listDealWatchItemsPage,
  reportShoppingDeals,
  setDealWatch,
} from "./deals"
import {
  createShoppingItem,
  createShoppingList,
  setShoppingItemStatus,
} from "./write"

const fixtures = createHouseholdFixtures()

afterAll(async () => {
  await fixtures.cleanup()
  await db.$disconnect()
})

const NOT_FOUND = { code: "NOT_FOUND" }
const PAGE = { limit: 50, offset: 0 }

// 10:00 in Oslo on 17 November.
const NOW = new Date("2026-11-17T09:00:00Z")

const offer = {
  store: "Elkjøp",
  price: 6990,
  regularPrice: 9990,
  productName: "Bosch Serie 6",
  url: "https://example.com/vaskemaskin",
  validTo: "2026-11-24",
}

async function listWithItems(
  context: ApplicationContext,
  options: { isPrivate?: boolean } = {}
) {
  const list = await createShoppingList(context, {
    name: "Vaskerom",
    isPrivate: options.isPrivate,
  })
  const washer = await createShoppingItem(context, {
    listId: list.id,
    name: "Vaskemaskin",
    estimatedPrice: 9000,
  })
  const dryer = await createShoppingItem(context, {
    listId: list.id,
    name: "Tørketrommel",
  })
  return { list, washer, dryer }
}

describe("boundaries", () => {
  it("is NOT_FOUND for another household's items, and changes nothing", async () => {
    const owner = await fixtures.createHousehold()
    const intruder = (await fixtures.createHousehold()).context
    const { washer } = await listWithItems(owner.context)

    await expect(
      setDealWatch(intruder, [{ itemId: washer.id, watch: true }])
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      reportShoppingDeals(intruder, [{ itemId: washer.id, deal: offer }])
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      clearShoppingItemDeal(intruder, washer.id)
    ).rejects.toMatchObject(NOT_FOUND)

    const stored = await db.shoppingItem.findUniqueOrThrow({
      where: { id: washer.id },
      include: { deal: true },
    })
    expect(stored).toMatchObject({ dealWatch: false, deal: null })
  })

  it("keeps another member's private list out of reach", async () => {
    const owner = await fixtures.createHousehold()
    const member = await fixtures.addMember(owner.householdId)
    const { washer } = await listWithItems(owner.context, { isPrivate: true })
    await reportShoppingDeals(
      owner.context,
      [{ itemId: washer.id, deal: offer }],
      NOW
    )

    await expect(
      setDealWatch(member, [{ itemId: washer.id, watch: true }])
    ).rejects.toMatchObject(NOT_FOUND)
    expect(
      (await listCurrentShoppingDeals(member, { now: NOW })).totalCount
    ).toBe(0)
    expect(
      (await listCurrentShoppingDeals(owner.context, { now: NOW })).totalCount
    ).toBe(1)
  })

  it("is all or nothing when one id is out of reach", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const { washer } = await listWithItems(owner.context)
    const { washer: foreign } = await listWithItems(other.context)

    await expect(
      setDealWatch(owner.context, [
        { itemId: washer.id, watch: true },
        { itemId: foreign.id, watch: true },
      ])
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      reportShoppingDeals(owner.context, [
        { itemId: washer.id, deal: offer },
        { itemId: foreign.id, deal: null },
      ])
    ).rejects.toMatchObject(NOT_FOUND)

    expect(
      await db.shoppingItem.findUniqueOrThrow({
        where: { id: washer.id },
        include: { deal: true },
      })
    ).toMatchObject({ dealWatch: false, dealCheckedAt: null, deal: null })
  })
})

describe("watching", () => {
  it("sets and clears the note and target price, and keeps omitted fields", async () => {
    const { context } = await fixtures.createHousehold()
    const { washer } = await listWithItems(context)

    const [first] = await setDealWatch(context, [
      { itemId: washer.id, watch: true, note: "Minst 8 kg", targetPrice: 7000 },
    ])
    expect(first).toMatchObject({
      dealWatch: true,
      dealWatchNote: "Minst 8 kg",
    })
    expect(first?.dealTargetPrice?.toNumber()).toBe(7000)

    const [kept] = await setDealWatch(context, [
      { itemId: washer.id, watch: false },
    ])
    expect(kept).toMatchObject({
      dealWatch: false,
      dealWatchNote: "Minst 8 kg",
    })

    const [cleared] = await setDealWatch(context, [
      { itemId: washer.id, watch: true, note: "", targetPrice: null },
    ])
    expect(cleared).toMatchObject({
      dealWatchNote: null,
      dealTargetPrice: null,
    })
  })

  it("rejects the same item twice in one call", async () => {
    const { context } = await fixtures.createHousehold()
    const { washer } = await listWithItems(context)

    await expect(
      setDealWatch(context, [
        { itemId: washer.id, watch: true },
        { itemId: washer.id, watch: false },
      ])
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("lists watched items still to be bought, never checked first", async () => {
    const { context } = await fixtures.createHousehold()
    const { list, washer, dryer } = await listWithItems(context)
    const bought = await createShoppingItem(context, {
      listId: list.id,
      name: "Strykejern",
    })
    await setDealWatch(context, [
      { itemId: washer.id, watch: true },
      { itemId: dryer.id, watch: true },
      { itemId: bought.id, watch: true },
    ])
    await setShoppingItemStatus(context, [bought.id], "PURCHASED")
    await reportShoppingDeals(context, [{ itemId: washer.id, deal: null }], NOW)

    const { totalCount, items } = await listDealWatchItemsPage(context, PAGE)
    expect(totalCount).toBe(2)
    expect(items.map((item) => item.name)).toEqual([
      "Tørketrommel",
      "Vaskemaskin",
    ])
    expect(items[1]?.dealCheckedAt).toEqual(NOW)
  })
})

describe("reporting offers", () => {
  it("adds, replaces and clears an offer without touching the item's updatedAt", async () => {
    const { context } = await fixtures.createHousehold()
    const { washer, dryer } = await listWithItems(context)
    const before = await db.shoppingItem.findUniqueOrThrow({
      where: { id: washer.id },
    })

    const first = await reportShoppingDeals(
      context,
      [
        { itemId: washer.id, deal: offer },
        { itemId: dryer.id, deal: null },
      ],
      NOW
    )
    expect(first.results.map((entry) => entry.status)).toEqual([
      "added",
      "none",
    ])

    const second = await reportShoppingDeals(
      context,
      [{ itemId: washer.id, deal: { ...offer, store: "Power", price: 6490 } }],
      NOW
    )
    expect(second.results[0]?.status).toBe("updated")

    const { deals } = await listCurrentShoppingDeals(context, { now: NOW })
    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({ store: "Power", item: { id: washer.id } })
    expect(deals[0]?.price.toNumber()).toBe(6490)

    const after = await db.shoppingItem.findUniqueOrThrow({
      where: { id: washer.id },
    })
    expect(after.updatedAt).toEqual(before.updatedAt)
    expect(after.dealCheckedAt).toEqual(NOW)

    const third = await reportShoppingDeals(
      context,
      [{ itemId: washer.id, deal: null }],
      NOW
    )
    expect(third.results[0]?.status).toBe("cleared")
    expect(
      (await listCurrentShoppingDeals(context, { now: NOW })).totalCount
    ).toBe(0)
  })

  it("skips an offer that has ended and leaves the item alone", async () => {
    const { context } = await fixtures.createHousehold()
    const { washer } = await listWithItems(context)

    const result = await reportShoppingDeals(
      context,
      [{ itemId: washer.id, deal: { ...offer, validTo: "2026-11-16" } }],
      NOW
    )

    expect(result).toEqual({
      results: [],
      skipped: [{ itemId: washer.id, name: "Vaskemaskin", reason: "EXPIRED" }],
    })
    expect(
      await db.shoppingItem.findUniqueOrThrow({
        where: { id: washer.id },
        include: { deal: true },
      })
    ).toMatchObject({ dealCheckedAt: null, deal: null })
  })

  it("rejects a period that ends before it starts", async () => {
    const { context } = await fixtures.createHousehold()
    const { washer } = await listWithItems(context)

    await expect(
      reportShoppingDeals(
        context,
        [{ itemId: washer.id, deal: { ...offer, validFrom: "2026-11-25" } }],
        NOW
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("shows an offer through its last day in Norway, and one without an end date for a week", async () => {
    const { context } = await fixtures.createHousehold()
    const { washer, dryer } = await listWithItems(context)
    await reportShoppingDeals(
      context,
      [
        { itemId: washer.id, deal: offer },
        { itemId: dryer.id, deal: { ...offer, validTo: null } },
      ],
      NOW
    )

    const names = async (now: Date) =>
      (await listCurrentShoppingDeals(context, { now })).deals.map(
        (deal) => deal.item.name
      )

    // 23:30 on the last day in Oslo is still 24 November there.
    expect(await names(new Date("2026-11-24T22:30:00Z"))).toEqual([
      "Vaskemaskin",
    ])
    expect(await names(new Date("2026-11-24T23:30:00Z"))).toEqual([])
    expect(await names(new Date("2026-11-24T08:00:00Z"))).toEqual([
      "Vaskemaskin",
      "Tørketrommel",
    ])
    expect(await names(new Date("2026-11-24T09:01:00Z"))).toEqual([
      "Vaskemaskin",
    ])
  })

  it("hides offers on items that are bought or skipped", async () => {
    const { context } = await fixtures.createHousehold()
    const { washer } = await listWithItems(context)
    await reportShoppingDeals(
      context,
      [{ itemId: washer.id, deal: offer }],
      NOW
    )

    await setShoppingItemStatus(context, [washer.id], "PURCHASED")
    expect(
      (await listCurrentShoppingDeals(context, { now: NOW })).totalCount
    ).toBe(0)
  })

  it("lets the household remove an offer from the web", async () => {
    const { context } = await fixtures.createHousehold()
    const { list, washer } = await listWithItems(context)
    await reportShoppingDeals(
      context,
      [{ itemId: washer.id, deal: offer }],
      NOW
    )

    await expect(clearShoppingItemDeal(context, washer.id)).resolves.toEqual({
      id: washer.id,
      listId: list.id,
    })
    expect(
      await db.shoppingItemDeal.count({ where: { itemId: washer.id } })
    ).toBe(0)
  })
})

describe("MCP round trip", () => {
  it("watches, reports and lists through the tools, and audits the writes", async () => {
    const owner = await fixtures.createHousehold()
    const { washer } = await listWithItems(owner.context)
    const session = fixtures.session(owner.context, ["shopping:write"])
    const tools = createToolRegistry(() => NOW)
    const call = (name: string, args: unknown) =>
      tools.find((tool) => tool.name === name)!.invoke(args, session)

    const watched = await call("set-deal-watch", {
      items: [{ itemId: washer.id, watch: true, targetPrice: 7500 }],
    })
    expect(watched.isError).toBeUndefined()

    const toCheck = await call("list-deal-watch-items", {})
    expect(toCheck.structuredContent).toMatchObject({
      today: "2026-11-17",
      items: [{ id: washer.id, targetPrice: "7500", plannedPrice: "9000.00" }],
    })

    const reported = await call("report-shopping-deals", {
      reports: [{ itemId: washer.id, deal: offer }],
    })
    expect(reported.structuredContent).toMatchObject({
      results: [{ itemId: washer.id, status: "added" }],
    })

    const current = await call("list-shopping-deals", {})
    expect(current.structuredContent).toMatchObject({
      deals: [
        {
          item: { id: washer.id, watched: true },
          deal: { store: "Elkjøp", price: "6990", savingsPercent: 30 },
        },
      ],
    })

    const audited = await db.mcpAuditEvent.findMany({
      where: { householdId: owner.householdId },
      select: { toolName: true, outcome: true },
      orderBy: { createdAt: "asc" },
    })
    expect(audited).toEqual([
      { toolName: "set-deal-watch", outcome: "success" },
      { toolName: "report-shopping-deals", outcome: "success" },
    ])
  })
})
