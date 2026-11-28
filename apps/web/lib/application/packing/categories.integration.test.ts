import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createToolRegistry } from "../../mcp/tools"
import { createHouseholdFixtures } from "../../test/household-fixtures"
import { getPackingList, listPackingItemNames } from "./read"
import {
  addBundlesToList,
  addPackingItems,
  createPackingBundle,
  createPackingGroup,
  createPackingList,
  duplicatePackingList,
  setPackingCategories,
  syncBundleToTemplates,
  updatePackingBundle,
  updatePackingItem,
} from "./write"

/* ADR 0018: every thing on a list and in a bundle has a category. */

const fixtures = createHouseholdFixtures()

afterAll(async () => {
  await fixtures.cleanup()
  await db.$disconnect()
})

function tool(name: string) {
  const found = createToolRegistry().find((entry) => entry.name === name)
  if (!found) throw new Error(`Unknown tool ${name}`)
  return found
}

function categories(
  list: { items: Array<{ name: string; category: string }> } | null
) {
  return Object.fromEntries(
    (list?.items ?? []).map((item) => [item.name, item.category])
  )
}

describe("categories on new things", () => {
  it("guesses from the name, or the bundle's name, unless one is given", async () => {
    const { context } = await fixtures.createHousehold()
    const bundle = await createPackingBundle(context, {
      name: "Toalettsaker",
      items: [
        { name: "Tannbørste" },
        { name: "Rød pose" },
        { name: "Ullsokker" },
        { name: "Bok", category: "OTHER" },
      ],
    })
    expect(
      Object.fromEntries(bundle.items.map((item) => [item.name, item.category]))
    ).toEqual({
      Tannbørste: "TOILETRIES",
      "Rød pose": "TOILETRIES",
      Ullsokker: "CLOTHING",
      Bok: "OTHER",
    })

    const { list } = await createPackingList(context, {
      name: "Hytta",
      bundleIds: [bundle.id],
      items: [{ name: "Mobillader" }, { name: "Gave til verten" }],
      groups: [{ name: "Førstehjelp", items: [{ name: "Ting fra apoteket" }] }],
    })
    // Bundle things carry the bundle's category; the rest are guessed, a
    // sub-list's name standing in when the name says nothing.
    expect(categories(list)).toEqual({
      Tannbørste: "TOILETRIES",
      "Rød pose": "TOILETRIES",
      Ullsokker: "CLOTHING",
      Bok: "OTHER",
      Mobillader: "ELECTRONICS",
      "Gave til verten": "OTHER",
      "Ting fra apoteket": "HEALTH",
    })

    const added = await addPackingItems(context, list.id, [
      { name: "Kaffe" },
      { name: "Kaffe til hytta", category: "HOME" },
    ])
    expect(categories(added.list)).toMatchObject({
      Kaffe: "FOOD",
      "Kaffe til hytta": "HOME",
    })
  })

  it("rejects an unknown category", async () => {
    const { context } = await fixtures.createHousehold()
    const { list } = await createPackingList(context, { name: "Tur" })
    await expect(
      addPackingItems(context, list.id, [
        // @ts-expect-error: not a category
        { name: "Sokker", category: "SOCKS" },
      ])
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("keeps the category when a thing is renamed or copied", async () => {
    const { context } = await fixtures.createHousehold()
    const { list } = await createPackingList(context, {
      name: "Tur",
      items: [{ name: "Sokker" }],
    })
    const item = list.items[0]!
    const renamed = await updatePackingItem(context, item.id, {
      name: "Kaffe",
    })
    expect(renamed.category).toBe("CLOTHING")

    const changed = await updatePackingItem(context, item.id, {
      category: "FOOD",
    })
    expect(changed.category).toBe("FOOD")

    const copy = await duplicatePackingList(context, list.id)
    expect(categories(copy)).toEqual({ Kaffe: "FOOD" })
  })
})

describe("bundle categories", () => {
  it("keeps an item's category on update unless a new one is sent", async () => {
    const { context } = await fixtures.createHousehold()
    const bundle = await createPackingBundle(context, {
      name: "Diverse",
      items: [{ name: "Pulsbelte", category: "ELECTRONICS" }],
    })
    const updated = await updatePackingBundle(context, bundle.id, {
      items: [
        { id: bundle.items[0]!.id, name: "Pulsbelte" },
        { name: "Hodelykt" },
      ],
    })
    expect(
      Object.fromEntries(
        updated.items.map((item) => [item.name, item.category])
      )
    ).toEqual({ Pulsbelte: "ELECTRONICS", Hodelykt: "OUTDOOR" })
  })

  it("passes a new category on to the copies that still had the old one", async () => {
    const { context } = await fixtures.createHousehold()
    const bundle = await createPackingBundle(context, {
      name: "Diverse",
      items: [{ name: "Pulsbelte" }, { name: "Drikkeflaske" }],
    })
    const { list: trip } = await createPackingList(context, {
      name: "Tur",
      bundleIds: [bundle.id],
    })
    const { list: other } = await createPackingList(context, {
      name: "Annen tur",
      bundleIds: [bundle.id],
    })
    // Set by hand on one list: stays.
    const handSet = other.items.find((item) => item.name === "Pulsbelte")!
    await updatePackingItem(context, handSet.id, { category: "LEISURE" })

    await updatePackingBundle(context, bundle.id, {
      items: bundle.items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.name === "Pulsbelte" ? "ELECTRONICS" : item.category,
      })),
    })

    expect(categories(await getPackingList(context, trip.id))).toMatchObject({
      Pulsbelte: "ELECTRONICS",
      Drikkeflaske: "OUTDOOR",
    })
    expect(categories(await getPackingList(context, other.id))).toMatchObject({
      Pulsbelte: "LEISURE",
    })
  })

  it("syncs categories to templates", async () => {
    const { context } = await fixtures.createHousehold()
    const bundle = await createPackingBundle(context, {
      name: "Diverse",
      items: [{ name: "Pulsbelte" }],
    })
    const { list: template } = await createPackingList(context, {
      name: "Mal",
      kind: "TEMPLATE",
      bundleIds: [bundle.id],
    })
    // Changed on the template by hand, so the bundle change does not follow.
    await updatePackingItem(context, template.items[0]!.id, {
      category: "HOME",
    })
    await updatePackingBundle(context, bundle.id, {
      items: [
        { id: bundle.items[0]!.id, name: "Pulsbelte", category: "ELECTRONICS" },
      ],
    })

    const result = await syncBundleToTemplates(context, bundle.id)
    expect(result.lists).toMatchObject([{ name: "Mal", updated: 1 }])
    expect(categories(await getPackingList(context, template.id))).toEqual({
      Pulsbelte: "ELECTRONICS",
    })
  })
})

describe("setPackingCategories", () => {
  async function household() {
    const { context } = await fixtures.createHousehold()
    const bundle = await createPackingBundle(context, {
      name: "Diverse",
      items: [{ name: "Pulsbelte" }, { name: "Ørepropper" }],
    })
    const { list } = await createPackingList(context, {
      name: "Tur",
      bundleIds: [bundle.id],
      items: [{ name: "Gave" }],
    })
    // The same name spelled differently, as a loose thing on another list.
    const { list: other } = await createPackingList(context, {
      name: "Annen tur",
      items: [{ name: "ørepropper " }],
    })
    return { context, bundle, list, other }
  }

  it("sets by name everywhere, and by id as an exception", async () => {
    const { context, bundle, list, other } = await household()
    const gift = list.items.find((item) => item.name === "Gave")!

    const result = await setPackingCategories(context, {
      names: [
        { name: "Ørepropper", category: "TOILETRIES" },
        { name: "Finnes ikke", category: "FOOD" },
      ],
      items: [{ itemId: gift.id, category: "LEISURE" }],
    })

    expect(result).toEqual({
      // "Ørepropper" on both lists, and the gift.
      itemCount: 3,
      bundleItemCount: 1,
      unmatchedNames: ["Finnes ikke"],
    })
    expect(categories(await getPackingList(context, list.id))).toMatchObject({
      Ørepropper: "TOILETRIES",
      Gave: "LEISURE",
    })
    expect(categories(await getPackingList(context, other.id))).toEqual({
      ørepropper: "TOILETRIES",
    })
    const names = await listPackingItemNames(context, {
      category: "TOILETRIES",
    })
    expect(names).toEqual([
      {
        name: "Ørepropper",
        category: "TOILETRIES",
        listItemCount: 2,
        bundleItemCount: 1,
        bundles: [bundle.name],
      },
    ])
  })

  it("sets a bundle item, and its copies follow", async () => {
    const { context, bundle, list } = await household()
    const belt = bundle.items.find((item) => item.name === "Pulsbelte")!

    await setPackingCategories(context, {
      bundleItems: [{ bundleItemId: belt.id, category: "ELECTRONICS" }],
    })

    expect(categories(await getPackingList(context, list.id))).toMatchObject({
      Pulsbelte: "ELECTRONICS",
    })
  })

  it("changes nothing when one id is outside the household", async () => {
    const { context, list } = await household()
    const { context: stranger, list: theirs } = await household()

    await expect(
      setPackingCategories(context, {
        items: [
          { itemId: list.items[0]!.id, category: "FOOD" },
          { itemId: theirs.items[0]!.id, category: "FOOD" },
        ],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      setPackingCategories(stranger, {
        names: [{ name: "Gave", category: "FOOD" }],
      })
    ).resolves.toMatchObject({ itemCount: 1 })

    expect(categories(await getPackingList(context, list.id))).toMatchObject({
      Gave: "OTHER",
    })
  })

  it("needs at least one entry", async () => {
    const { context } = await fixtures.createHousehold()
    await expect(setPackingCategories(context, {})).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    })
  })
})

describe("category MCP tools", () => {
  it("lists what is uncategorised and fixes it by name", async () => {
    const { context } = await fixtures.createHousehold()
    const session = fixtures.session(context, ["packing:read", "packing:write"])
    const { list } = await createPackingList(context, {
      name: "Tur",
      items: [{ name: "Gave" }, { name: "Sokker" }],
    })
    await createPackingGroup(context, list.id, { name: "Til bilen" })

    const other = await tool("list-packing-item-names").invoke(
      { category: "OTHER" },
      session
    )
    expect(other.structuredContent).toMatchObject({
      names: [{ name: "Gave", category: "OTHER", listItemCount: 1 }],
      pageInfo: { totalCount: 1 },
    })

    const set = await tool("set-packing-categories").invoke(
      { names: [{ name: "gave", category: "LEISURE" }] },
      session
    )
    expect(set.isError).toBeUndefined()
    expect(set.structuredContent).toMatchObject({ itemCount: 1 })

    const overview = await tool("list-packing-categories").invoke({}, session)
    expect(overview.structuredContent).toMatchObject({
      categories: expect.arrayContaining([
        expect.objectContaining({ category: "LEISURE", listItemCount: 1 }),
        expect.objectContaining({ category: "OTHER", listItemCount: 0 }),
      ]),
    })

    const card = await tool("get-packing-list").invoke(
      { listId: list.id, category: "CLOTHING" },
      session
    )
    expect(card.structuredContent).toMatchObject({
      list: { itemCount: 2, items: [{ name: "Sokker", category: "CLOTHING" }] },
    })
  })

  it("adds a bundle with categories through MCP", async () => {
    const { context } = await fixtures.createHousehold()
    const session = fixtures.session(context, ["packing:read", "packing:write"])
    const bundle = await createPackingBundle(context, {
      name: "Barn",
      items: [{ name: "Bleier" }],
    })
    const { list } = await createPackingList(context, { name: "Tur" })
    await addBundlesToList(context, list.id, [bundle.id])

    const result = await tool("get-packing-bundle").invoke(
      { bundleId: bundle.id },
      session
    )
    expect(result.structuredContent).toMatchObject({
      bundle: { items: [{ name: "Bleier", category: "KIDS" }] },
    })
  })
})
