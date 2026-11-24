import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createToolRegistry } from "../../mcp/tools"
import { createHouseholdFixtures } from "../../test/household-fixtures"
import {
  getPackingList,
  listBundleTemplateUsage,
  listPackingLists,
} from "./read"
import {
  addBundlesToList,
  addPackingItems,
  createPackingBundle,
  createPackingGroup,
  createPackingList,
  createPackingPerson,
  deletePackingGroup,
  deletePackingPerson,
  duplicatePackingList,
  removeBundleFromList,
  syncBundleToTemplates,
  updatePackingBundle,
  updatePackingGroup,
  updatePackingItem,
  updatePackingList,
} from "./write"

/*
 * ADR 0017: list kinds, a bundle's own person, numbers per trip length,
 * templates that follow their bundles, and sub-lists.
 */

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

type Item = { name: string; quantity: number; personId: string | null }

function quantities(list: { items: Item[] } | null) {
  return Object.fromEntries(
    (list?.items ?? []).map((item) => [item.name, item.quantity])
  )
}

describe("list kinds", () => {
  it("keeps templates, trips and finished trips apart", async () => {
    const { context } = await fixtures.createHousehold()
    const { list: template } = await createPackingList(context, {
      name: "Hytta vinter",
      kind: "TEMPLATE",
    })
    const { list: trip } = await createPackingList(context, { name: "Påske" })
    expect(template.kind).toBe("TEMPLATE")
    expect(trip.kind).toBe("TRIP")

    await updatePackingList(context, trip.id, { kind: "ARCHIVED" })

    const kinds = async (kind: "TEMPLATE" | "TRIP" | "ARCHIVED") =>
      (await listPackingLists(context, { kind })).map((list) => list.name)
    expect(await kinds("TEMPLATE")).toEqual(["Hytta vinter"])
    expect(await kinds("TRIP")).toEqual([])
    expect(await kinds("ARCHIVED")).toEqual(["Påske"])
  })

  it("starts a trip from a template, with the trip's own details", async () => {
    const { context } = await fixtures.createHousehold()
    const { list: template } = await createPackingList(context, {
      name: "Hytta",
      kind: "TEMPLATE",
      duration: "WEEKEND",
    })
    const { groupId } = await createPackingGroup(context, template.id, {
      name: "Til bilen",
      items: [{ name: "Snøkjetting" }],
    })
    await addPackingItems(context, template.id, [{ name: "Ved" }])

    const trip = await duplicatePackingList(context, template.id, {
      kind: "TRIP",
      name: "Hytta vinterferie",
      duration: "WEEK",
      departureOn: "2027-02-20",
    })

    expect(trip).toMatchObject({
      kind: "TRIP",
      name: "Hytta vinterferie",
      duration: "WEEK",
    })
    expect(trip.groups.map((group) => group.name)).toEqual(["Til bilen"])
    const chain = trip.items.find((item) => item.name === "Snøkjetting")
    expect(chain?.groupId).toBe(trip.groups[0]!.id)
    expect(chain?.groupId).not.toBe(groupId)

    // The template is untouched, and a finished trip copies to a new trip.
    expect((await getPackingList(context, template.id))?.kind).toBe("TEMPLATE")
    await updatePackingList(context, trip.id, { kind: "ARCHIVED" })
    const again = await duplicatePackingList(context, trip.id)
    expect(again.kind).toBe("TRIP")
    expect(again.name).toBe("Hytta vinterferie")
  })
})

describe("a bundle's own person", () => {
  it("gives the bundle's things to its person unless told otherwise", async () => {
    const { context } = await fixtures.createHousehold()
    const astrid = await createPackingPerson(context, { name: "Astrid" })
    const ola = await createPackingPerson(context, { name: "Ola" })
    const toiletries = await createPackingBundle(context, {
      name: "Astrids toalettsaker",
      personId: astrid.id,
      autoAdd: true,
      items: [{ name: "Tannbørste" }],
    })
    expect(toiletries.person?.name).toBe("Astrid")

    // Automatic and chosen bundles both go to the bundle's person.
    const { list } = await createPackingList(context, { name: "Helg" })
    expect(list.items.map((item) => item.personId)).toEqual([astrid.id])

    const { list: other } = await createPackingList(context, {
      name: "Tur",
      applyAutoBundles: false,
    })
    await addBundlesToList(context, other.id, [toiletries.id])
    await addBundlesToList(context, other.id, [toiletries.id], {
      personId: ola.id,
    })
    await addBundlesToList(context, other.id, [toiletries.id], {
      personId: null,
    })
    const owners = (await getPackingList(context, other.id))?.items.map(
      (item) => item.personId
    )
    expect(owners).toEqual([astrid.id, ola.id, null])

    // Deleting the person makes the bundle shared again.
    await deletePackingPerson(context, astrid.id)
    const after = await db.packingBundle.findUnique({
      where: { id: toiletries.id },
    })
    expect(after?.personId).toBeNull()
  })

  it("rejects a person from another household", async () => {
    const { context } = await fixtures.createHousehold()
    const { context: stranger } = await fixtures.createHousehold()
    const theirs = await createPackingPerson(stranger, { name: "Kari" })

    await expect(
      createPackingBundle(context, { name: "Kari sin", personId: theirs.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("numbers per trip length", () => {
  async function setUp() {
    const { context } = await fixtures.createHousehold()
    const clothes = await createPackingBundle(context, {
      name: "Klær",
      items: [
        {
          name: "Boksere",
          quantity: 2,
          quantityByDuration: { WEEKEND: 3, WEEK: 7 },
        },
        { name: "Genser" },
      ],
    })
    return { context, clothes }
  }

  it("packs the number for the trip's length", async () => {
    const { context, clothes } = await setUp()
    const weekend = await createPackingList(context, {
      name: "Helg",
      duration: "WEEKEND",
      bundleIds: [clothes.id],
    })
    const week = await createPackingList(context, {
      name: "Uke",
      duration: "WEEK",
      bundleIds: [clothes.id],
    })
    const unknown = await createPackingList(context, {
      name: "Ukjent",
      bundleIds: [clothes.id],
    })

    expect(quantities(weekend.list)).toEqual({ Boksere: 3, Genser: 1 })
    expect(quantities(week.list)).toEqual({ Boksere: 7, Genser: 1 })
    expect(quantities(unknown.list)).toEqual({ Boksere: 2, Genser: 1 })
  })

  it("stores a number equal to the plain quantity as no own number", async () => {
    const { context } = await fixtures.createHousehold()
    const bundle = await createPackingBundle(context, {
      name: "Sokker",
      items: [{ name: "Sokker", quantity: 2, quantityByDuration: { DAY: 2 } }],
    })
    expect(bundle.items[0]?.quantityDay).toBeNull()
  })

  it("follows a new length, except numbers changed by hand or packed", async () => {
    const { context, clothes } = await setUp()
    await createPackingBundle(context, {
      name: "Sokker",
      items: [{ name: "Sokker", quantity: 1, quantityByDuration: { WEEK: 6 } }],
    })
    const socks = (await db.packingBundle.findFirst({
      where: { householdId: context.householdId, name: "Sokker" },
    }))!
    const { list } = await createPackingList(context, {
      name: "Tur",
      duration: "WEEKEND",
      bundleIds: [clothes.id, socks.id],
    })
    const sweater = list.items.find((item) => item.name === "Genser")!
    await updatePackingItem(context, sweater.id, { quantity: 4 })
    const sock = list.items.find((item) => item.name === "Sokker")!
    await updatePackingItem(context, sock.id, { packed: true })

    const updated = await updatePackingList(context, list.id, {
      duration: "WEEK",
    })

    expect(quantities(updated)).toEqual({ Boksere: 7, Genser: 4, Sokker: 1 })
  })
})

describe("templates follow their bundles", () => {
  it("adds, updates and removes things on templates only", async () => {
    const { context } = await fixtures.createHousehold()
    const ola = await createPackingPerson(context, { name: "Ola" })
    const bundle = await createPackingBundle(context, {
      name: "Toalettsaker",
      items: [
        { name: "Tannbørste" },
        { name: "Tannkrem" },
        { name: "Hårbørste" },
      ],
    })
    const { list: template } = await createPackingList(context, {
      name: "Hytta",
      kind: "TEMPLATE",
      duration: "WEEK",
      bundles: [
        { bundleId: bundle.id },
        { bundleId: bundle.id, personId: ola.id },
      ],
    })
    const { list: trip } = await createPackingList(context, {
      name: "Påske",
      bundleIds: [bundle.id],
    })
    const before = await getPackingList(context, trip.id)

    // Rename one (keeping its id), drop one, add one with a weekly number.
    const [brush, paste] = bundle.items
    await updatePackingBundle(context, bundle.id, {
      items: [
        { id: brush!.id, name: "Elektrisk tannbørste" },
        { id: paste!.id, name: "Tannkrem", quantityByDuration: { WEEK: 2 } },
        { name: "Solkrem" },
      ],
    })

    const preview = await syncBundleToTemplates(context, bundle.id, {
      dryRun: true,
    })
    expect(preview).toMatchObject({
      dryRun: true,
      lists: [{ name: "Hytta", added: 2, updated: 4, removed: 2 }],
    })
    expect((await getPackingList(context, template.id))?.items).toHaveLength(6)

    const result = await syncBundleToTemplates(context, bundle.id)
    expect(result.lists).toEqual([
      {
        listId: template.id,
        name: "Hytta",
        added: 2,
        updated: 4,
        removed: 2,
      },
    ])

    const synced = await getPackingList(context, template.id)
    const forPerson = (personId: string | null) =>
      synced?.items
        .filter((item) => item.personId === personId)
        .map((item) => `${item.name}×${item.quantity}`)
        .sort()
    const expected = ["Elektrisk tannbørste×1", "Solkrem×1", "Tannkrem×2"]
    expect(forPerson(null)).toEqual(expected)
    expect(forPerson(ola.id)).toEqual(expected)

    // The trip keeps what it was packed with. Only the link to a removed
    // bundle item is cleared.
    const content = (list: typeof before) =>
      list?.items.map((item) => [item.id, item.name, item.quantity])
    expect(content(await getPackingList(context, trip.id))).toEqual(
      content(before)
    )
  })

  it("matches items copied before the link existed by name", async () => {
    const { context } = await fixtures.createHousehold()
    const bundle = await createPackingBundle(context, {
      name: "Bad",
      items: [{ name: "Badetøy", quantity: 1 }],
    })
    const { list } = await createPackingList(context, {
      name: "Syden",
      kind: "TEMPLATE",
      bundleIds: [bundle.id],
    })
    await db.packingItem.updateMany({
      where: { listId: list.id },
      data: { bundleItemId: null },
    })
    await updatePackingBundle(context, bundle.id, {
      items: [{ name: "badetøy", quantity: 2 }],
    })

    const result = await syncBundleToTemplates(context, bundle.id)

    expect(result.lists[0]).toMatchObject({ added: 0, updated: 1, removed: 0 })
    const synced = await getPackingList(context, list.id)
    expect(synced?.items).toMatchObject([
      { name: "badetøy", quantity: 2, bundleItemId: bundle.items[0]!.id },
    ])
  })

  it("keeps following a bundle that was empty for a while", async () => {
    const { context } = await fixtures.createHousehold()
    const ola = await createPackingPerson(context, { name: "Ola" })
    const bundle = await createPackingBundle(context, {
      name: "Bad",
      items: [{ name: "Badetøy" }],
    })
    const { list } = await createPackingList(context, {
      name: "Syden",
      kind: "TEMPLATE",
      bundles: [{ bundleId: bundle.id, personId: ola.id }],
    })

    await updatePackingBundle(context, bundle.id, { items: [] })
    await syncBundleToTemplates(context, bundle.id)
    expect((await getPackingList(context, list.id))?.items).toEqual([])
    expect((await listBundleTemplateUsage(context)).get(bundle.id)).toEqual([
      { id: list.id, name: "Syden" },
    ])

    await updatePackingBundle(context, bundle.id, {
      items: [{ name: "Solkrem" }],
    })
    const result = await syncBundleToTemplates(context, bundle.id, {
      listIds: [list.id],
    })

    expect(result.lists).toMatchObject([{ listId: list.id, added: 1 }])
    expect((await getPackingList(context, list.id))?.items).toMatchObject([
      { name: "Solkrem", personId: ola.id, bundleId: bundle.id },
    ])
  })

  it("stops following a bundle that was removed from the template", async () => {
    const { context } = await fixtures.createHousehold()
    const bundle = await createPackingBundle(context, {
      name: "Bad",
      items: [{ name: "Badetøy" }],
    })
    const { list } = await createPackingList(context, {
      name: "Syden",
      kind: "TEMPLATE",
      bundleIds: [bundle.id],
    })
    const copy = await duplicatePackingList(context, list.id)
    expect(
      (await listBundleTemplateUsage(context)).get(bundle.id)
    ).toHaveLength(2)

    await removeBundleFromList(context, list.id, bundle.id)
    await updatePackingBundle(context, bundle.id, {
      items: [{ name: "Badetøy" }, { name: "Solkrem" }],
    })
    const result = await syncBundleToTemplates(context, bundle.id)

    expect(result.lists.map((entry) => entry.listId)).toEqual([copy.id])
    expect((await getPackingList(context, list.id))?.items).toEqual([])
  })

  it("rejects a list that is not a template using the bundle", async () => {
    const { context } = await fixtures.createHousehold()
    const bundle = await createPackingBundle(context, {
      name: "Bad",
      items: [{ name: "Badetøy" }],
    })
    const { list: trip } = await createPackingList(context, {
      name: "Syden",
      bundleIds: [bundle.id],
    })

    await expect(
      syncBundleToTemplates(context, bundle.id, { listIds: [trip.id] })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })
})

describe("sub-lists", () => {
  it("adds, renames, moves into and deletes sub-lists", async () => {
    const { context } = await fixtures.createHousehold()
    const { list } = await createPackingList(context, {
      name: "Tur",
      groups: [{ name: "Kjøpe før avreise", items: [{ name: "Solkrem" }] }],
    })
    const buy = list.groups[0]!
    expect(list.items[0]).toMatchObject({ name: "Solkrem", groupId: buy.id })

    const { groupId } = await createPackingGroup(context, list.id, {
      name: "Til bilen",
    })
    await expect(
      createPackingGroup(context, list.id, { name: "til bilen" })
    ).rejects.toMatchObject({ code: "CONFLICT" })

    const added = await addPackingItems(context, list.id, [
      { name: "Kart", groupId },
      { name: "Bok" },
    ])
    const book = added.list.items.find((item) => item.name === "Bok")!
    await updatePackingItem(context, book.id, { groupId })
    await updatePackingGroup(context, groupId, { name: "Bilen" })

    let current = await getPackingList(context, list.id)
    expect(
      current?.items
        .filter((item) => item.group?.name === "Bilen")
        .map((item) => item.name)
    ).toEqual(["Kart", "Bok"])

    await deletePackingGroup(context, buy.id, { keepItems: true })
    await deletePackingGroup(context, groupId)
    current = await getPackingList(context, list.id)
    expect(current?.groups).toEqual([])
    expect(current?.items.map((item) => [item.name, item.groupId])).toEqual([
      ["Solkrem", null],
    ])
  })

  it("rejects a sub-list from another list", async () => {
    const { context } = await fixtures.createHousehold()
    const { list: first } = await createPackingList(context, { name: "A" })
    const { list: second } = await createPackingList(context, {
      name: "B",
      items: [{ name: "Ting" }],
    })
    const { groupId } = await createPackingGroup(context, first.id, {
      name: "Gruppe",
    })

    await expect(
      addPackingItems(context, second.id, [{ name: "Annet", groupId }])
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      updatePackingItem(context, second.items[0]!.id, { groupId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    const { context: stranger } = await fixtures.createHousehold()
    await expect(deletePackingGroup(stranger, groupId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })
})

describe("packing MCP tools for templates", () => {
  it("previews and applies a template update", async () => {
    const { context } = await fixtures.createHousehold()
    const session = fixtures.session(context, ["packing:read", "packing:write"])
    const bundle = await createPackingBundle(context, {
      name: "Klær",
      items: [{ name: "Boksere" }],
    })
    await createPackingList(context, {
      name: "Mal",
      kind: "TEMPLATE",
      duration: "WEEK",
      bundleIds: [bundle.id],
    })
    await tool("update-packing-bundle").invoke(
      {
        bundleId: bundle.id,
        items: [
          {
            id: bundle.items[0]!.id,
            name: "Boksere",
            quantityByDuration: { WEEK: 7 },
          },
        ],
      },
      session
    )

    const preview = await tool("sync-packing-bundle-to-templates").invoke(
      { bundleId: bundle.id, dryRun: true },
      session
    )
    expect(preview.structuredContent).toMatchObject({
      dryRun: true,
      lists: [{ name: "Mal", updated: 1 }],
    })

    const applied = await tool("sync-packing-bundle-to-templates").invoke(
      { bundleId: bundle.id },
      session
    )
    expect(applied.structuredContent).toMatchObject({ dryRun: false })

    const { structuredContent } = await tool("list-packing-lists").invoke(
      { kind: "TEMPLATE" },
      session
    )
    expect(structuredContent).toMatchObject({
      lists: [{ name: "Mal", kind: "TEMPLATE" }],
    })
  })
})
