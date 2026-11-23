import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createToolRegistry } from "../../mcp/tools"
import { createHouseholdFixtures } from "../../test/household-fixtures"
import { getPackingList, listPackingBundles } from "./read"
import {
  addBundlesToList,
  addPackingItems,
  createPackingBundle,
  MAX_PACKING_ITEMS,
  createPackingList,
  createPackingPerson,
  deletePackingBundle,
  deletePackingPerson,
  deletePackingItems,
  duplicatePackingList,
  removeBundleFromList,
  setPackingItemsPacked,
  updatePackingBundle,
  updatePackingItem,
} from "./write"

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

function names(list: { items: Array<{ name: string }> } | null) {
  return list?.items.map((item) => item.name)
}

describe("packing write service", () => {
  it("adds the chosen bundles and the auto bundles that fit the trip", async () => {
    const { context } = await fixtures.createHousehold()
    const training = await createPackingBundle(context, {
      name: "Treningstøy",
      items: [{ name: "Joggesko" }, { name: "Shorts" }, { name: "Ladekabel" }],
    })
    await createPackingBundle(context, {
      name: "Toalettsaker",
      autoAdd: true,
      items: [{ name: "Tannbørste" }, { name: "Ladekabel" }],
    })
    await createPackingBundle(context, {
      name: "Utenlandsreise",
      abroadOnly: true,
      autoAdd: true,
      items: [{ name: "Pass" }],
    })
    await createPackingBundle(context, {
      name: "Vintertøy barn",
      seasons: ["WINTER"],
      autoAdd: true,
      items: [{ name: "Ullundertøy", quantity: 2 }],
    })

    const result = await createPackingList(context, {
      name: "Syden",
      season: "SUMMER",
      duration: "WEEK",
      abroad: true,
      bundleIds: [training.id],
      items: [{ name: "Solkrem" }],
    })

    expect(result.addedBundles.map((bundle) => bundle.name)).toEqual([
      "Treningstøy",
      "Toalettsaker",
      "Utenlandsreise",
    ])
    expect(names(result.list)).toEqual([
      "Joggesko",
      "Shorts",
      "Ladekabel",
      "Tannbørste",
      "Pass",
      "Solkrem",
    ])
    // The second charger is the same thing, so it is packed once.
    expect(result.skipped.map((item) => item.name)).toEqual(["Ladekabel"])
  })

  it("adds no auto bundles when asked not to", async () => {
    const { context } = await fixtures.createHousehold()
    await createPackingBundle(context, {
      name: "Alltid",
      autoAdd: true,
      items: [{ name: "Lommebok" }],
    })

    const result = await createPackingList(context, {
      name: "Dagstur",
      applyAutoBundles: false,
    })

    expect(result.list.items).toEqual([])
  })

  it("removes a bundle's items, keeping the packed ones on request", async () => {
    const { context } = await fixtures.createHousehold()
    const bundle = await createPackingBundle(context, {
      name: "Treningstøy",
      items: [{ name: "Joggesko" }, { name: "Shorts" }],
    })
    const { list } = await createPackingList(context, { name: "Hytta" })
    const added = await addBundlesToList(context, list.id, [bundle.id])
    await addPackingItems(context, list.id, [{ name: "Bok" }])
    const shoes = added.list.items.find((item) => item.name === "Joggesko")!
    await updatePackingItem(context, shoes.id, { packed: true })

    const removed = await removeBundleFromList(context, list.id, bundle.id, {
      keepPacked: true,
    })

    expect(removed.deletedCount).toBe(1)
    expect(names(removed.list)).toEqual(["Joggesko", "Bok"])
  })

  it("unpacks a whole list and copies it with nothing packed", async () => {
    const { context } = await fixtures.createHousehold()
    const { list } = await createPackingList(context, {
      name: "Hytta",
      season: "WINTER",
      items: [{ name: "Ski" }, { name: "Votter", quantity: 2 }],
    })
    await setPackingItemsPacked(context, list.id, { packed: true })

    const copy = await duplicatePackingList(context, list.id)
    expect(copy).toMatchObject({ name: "Hytta (kopi)", season: "WINTER" })
    expect(
      copy.items.map((item) => [item.name, item.quantity, item.packed])
    ).toEqual([
      ["Ski", 1, false],
      ["Votter", 2, false],
    ])

    const reset = await setPackingItemsPacked(context, list.id, {
      packed: false,
    })
    expect(reset.changedCount).toBe(2)
    expect(reset.list.items.every((item) => !item.packed)).toBe(true)
  })

  it("changes nothing when one of the ids is not on the list", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const mine = await createPackingList(owner.context, {
      name: "Min",
      items: [{ name: "Ski" }],
    })
    const theirs = await createPackingList(other.context, {
      name: "Deres",
      items: [{ name: "Pass" }],
    })
    const foreignItem = theirs.list.items[0]!.id

    await expect(
      setPackingItemsPacked(owner.context, mine.list.id, {
        packed: true,
        itemIds: [mine.list.items[0]!.id, foreignItem],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      deletePackingItems(owner.context, [foreignItem])
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      updatePackingItem(owner.context, foreignItem, { packed: true })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(
      (await getPackingList(owner.context, mine.list.id))?.items[0]?.packed
    ).toBe(false)
    expect(await getPackingList(owner.context, theirs.list.id)).toBeNull()
  })

  it("rejects a bundle from another household", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const foreign = await createPackingBundle(other.context, { name: "Deres" })

    await expect(
      createPackingList(owner.context, { name: "Tur", bundleIds: [foreign.id] })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(
      await db.packingList.count({ where: { householdId: owner.householdId } })
    ).toBe(0)
  })

  it("replaces a bundle's items and reports a duplicate name as CONFLICT", async () => {
    const { context } = await fixtures.createHousehold()
    const bundle = await createPackingBundle(context, {
      name: "Treningstøy",
      seasons: ["WINTER", "SPRING"],
      items: [{ name: "Joggesko" }, { name: "Shorts" }],
    })
    await createPackingBundle(context, { name: "Badetøy" })

    const updated = await updatePackingBundle(context, bundle.id, {
      items: [{ name: "Shorts" }, { name: "Vannflaske" }],
    })
    expect(updated.seasons).toEqual(["SPRING", "WINTER"])
    expect(updated.items.map((item) => item.name)).toEqual([
      "Shorts",
      "Vannflaske",
    ])

    await expect(
      updatePackingBundle(context, bundle.id, { name: "badetøy" })
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(
      createPackingBundle(context, { name: "BADETØY" })
    ).rejects.toMatchObject({ code: "CONFLICT" })
    // Renaming a bundle to its own name in another case is fine.
    await expect(
      updatePackingBundle(context, bundle.id, { name: "treningstøy" })
    ).resolves.toMatchObject({ name: "treningstøy" })
    await expect(
      createPackingBundle(context, {
        name: "Dobbel",
        items: [{ name: "Sokker" }, { name: "sokker" }],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("keeps items on lists when their bundle is deleted", async () => {
    const { context } = await fixtures.createHousehold()
    const bundle = await createPackingBundle(context, {
      name: "Treningstøy",
      items: [{ name: "Joggesko" }],
    })
    const { list } = await createPackingList(context, {
      name: "Hytta",
      bundleIds: [bundle.id],
    })

    await deletePackingBundle(context, bundle.id)

    const after = await getPackingList(context, list.id)
    expect(after?.items).toMatchObject([{ name: "Joggesko", bundleId: null }])
    expect(await listPackingBundles(context)).toEqual([])
  })

  it("filters bundles by season, counting those without one", async () => {
    const { context } = await fixtures.createHousehold()
    await createPackingBundle(context, { name: "Alltid" })
    await createPackingBundle(context, { name: "Vinter", seasons: ["WINTER"] })
    await createPackingBundle(context, { name: "Sommer", seasons: ["SUMMER"] })

    const winter = await listPackingBundles(context, { season: "WINTER" })
    expect(winter.map((bundle) => bundle.name)).toEqual(["Alltid", "Vinter"])
  })
})

describe("packing for people", () => {
  it("gives each person their own copy of a bundle and of a thing", async () => {
    const { context } = await fixtures.createHousehold()
    const ola = await createPackingPerson(context, { name: "Ola" })
    const kari = await createPackingPerson(context, { name: "Kari" })
    const winter = await createPackingBundle(context, {
      name: "Vintertøy barn",
      items: [{ name: "Votter" }, { name: "Lue" }],
    })

    const result = await createPackingList(context, {
      name: "Hytta",
      bundles: [
        { bundleId: winter.id, personId: ola.id },
        { bundleId: winter.id, personId: kari.id },
      ],
      items: [{ name: "Votter", personId: ola.id }, { name: "Votter" }],
    })

    expect(
      result.list.items.map(
        (item) => `${item.name}:${item.person?.name ?? "-"}`
      )
    ).toEqual(["Votter:Ola", "Lue:Ola", "Votter:Kari", "Lue:Kari", "Votter:-"])
    // Ola already had mittens from the bundle.
    expect(result.skipped.map((item) => item.name)).toEqual(["Votter"])
    expect(result.addedBundles).toEqual([
      { id: winter.id, name: "Vintertøy barn", personId: ola.id },
      { id: winter.id, name: "Vintertøy barn", personId: kari.id },
    ])
  })

  it("packs and removes one person's things only", async () => {
    const { context } = await fixtures.createHousehold()
    const ola = await createPackingPerson(context, { name: "Ola" })
    const kari = await createPackingPerson(context, { name: "Kari" })
    const winter = await createPackingBundle(context, {
      name: "Vintertøy barn",
      items: [{ name: "Votter" }],
    })
    const { list } = await createPackingList(context, { name: "Hytta" })
    await addBundlesToList(context, list.id, [winter.id], { personId: ola.id })
    await addBundlesToList(context, list.id, [winter.id], { personId: kari.id })

    const packed = await setPackingItemsPacked(context, list.id, {
      packed: true,
      personId: ola.id,
    })
    expect(packed.changedCount).toBe(1)

    const removed = await removeBundleFromList(context, list.id, winter.id, {
      personId: kari.id,
    })
    expect(removed.list.items).toMatchObject([
      { name: "Votter", personId: ola.id, packed: true },
    ])
  })

  it("keeps a deleted person's things as shared things", async () => {
    const { context } = await fixtures.createHousehold()
    const ola = await createPackingPerson(context, { name: "Ola" })
    const { list } = await createPackingList(context, {
      name: "Hytta",
      items: [{ name: "Bamse", personId: ola.id }],
    })

    await deletePackingPerson(context, ola.id)

    expect((await getPackingList(context, list.id))?.items).toMatchObject([
      { name: "Bamse", personId: null },
    ])
  })

  it("rejects a person from another household and duplicate names", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const theirs = await createPackingPerson(other.context, { name: "Ola" })
    const { list } = await createPackingList(owner.context, {
      name: "Hytta",
      items: [{ name: "Ski" }],
    })

    await expect(
      addPackingItems(owner.context, list.id, [
        { name: "Bamse", personId: theirs.id },
      ])
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      updatePackingItem(owner.context, list.items[0]!.id, {
        personId: theirs.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await createPackingPerson(owner.context, { name: "Ola" })
    await expect(
      createPackingPerson(owner.context, { name: "ola" })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})

describe("packing list capacity", () => {
  it("counts every row when duplicates are created on purpose", async () => {
    const { context } = await fixtures.createHousehold()
    const { list } = await createPackingList(context, { name: "Stor" })
    await db.packingItem.createMany({
      data: Array.from({ length: MAX_PACKING_ITEMS }, (_, index) => ({
        listId: list.id,
        name: `Ting ${index}`,
        sortOrder: index,
      })),
    })

    // A name already on the list is skipped, so it fits.
    await expect(
      addPackingItems(context, list.id, [{ name: "Ting 1" }])
    ).resolves.toMatchObject({ skipped: [{ name: "Ting 1" }] })
    // Created anyway, it would be item 301.
    await expect(
      addPackingItems(context, list.id, [{ name: "Ting 1" }], {
        onDuplicate: "create",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    expect(await db.packingItem.count({ where: { listId: list.id } })).toBe(
      MAX_PACKING_ITEMS
    )
  })
})

describe("packing MCP tools", () => {
  it("lays out a trip and ticks it off", async () => {
    const { context } = await fixtures.createHousehold()
    const session = fixtures.session(context, ["packing:write"])

    const bundle = await tool("create-packing-bundle").invoke(
      {
        name: "Utenlandsreise",
        abroadOnly: true,
        autoAdd: true,
        items: [{ name: "Pass" }, { name: "Reiseforsikring" }],
      },
      session
    )
    expect(bundle.isError).toBeUndefined()

    const created = await tool("create-packing-list").invoke(
      {
        name: "London",
        season: "AUTUMN",
        duration: "WEEKEND",
        abroad: true,
        departureOn: "2026-10-09",
        items: [{ name: "Paraply" }],
      },
      session
    )
    const list = (
      created.structuredContent as {
        list: { id: string; items: Array<{ id: string; name: string }> }
      }
    ).list
    expect(created.structuredContent).toMatchObject({
      addedBundles: [{ name: "Utenlandsreise" }],
      list: {
        departureOn: "2026-10-09",
        itemCount: 3,
        bundles: [{ name: "Utenlandsreise" }],
      },
    })

    const ticked = await tool("set-packing-items-packed").invoke(
      { listId: list.id, packed: true, itemIds: [list.items[0]!.id] },
      session
    )
    expect(ticked.structuredContent).toMatchObject({
      changedCount: 1,
      list: { packedCount: 1 },
    })

    const read = await tool("list-packing-lists").invoke(
      { abroad: true },
      fixtures.session(context, ["packing:read"])
    )
    expect(read.structuredContent).toMatchObject({
      lists: [{ name: "London", itemCount: 3, packedCount: 1 }],
    })
  })
})
