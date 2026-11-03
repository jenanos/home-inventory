import { db } from "@workspace/db"
import { afterAll, describe, expect, it } from "vitest"

import { createToolRegistry } from "../../mcp/tools"
import { createHouseholdFixtures } from "../../test/household-fixtures"
import type { ApplicationContext } from "../context"
import { MAX_BATCH_SIZE } from "../mutations"
import {
  bulkCreateShoppingItems,
  bulkImportShoppingItemsWithDuplicates,
} from "./import"
import {
  addProductAlternative,
  addShoppingItems,
  createShoppingItem,
  createShoppingList,
  deleteProductAlternative,
  deleteShoppingItem,
  deleteShoppingList,
  reorderAlternatives,
  setPreferredAlternative,
  setShoppingItemStatus,
  setShoppingListPrivacy,
  toggleShoppingItemPurchased,
  updateProductAlternative,
  updateShoppingItem,
  updateShoppingList,
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

async function listWithItem(
  context: ApplicationContext,
  options: { isPrivate?: boolean } = {}
) {
  const list = await createShoppingList(context, {
    name: "Kjøkken",
    isPrivate: options.isPrivate,
  })
  const item = await createShoppingItem(context, {
    listId: list.id,
    name: "Kaffetrakter",
    estimatedPrice: 999,
    alternatives: [{ name: "Moccamaster", price: 2499 }, { name: "Wilfa" }],
  })
  return { list, item }
}

const NOT_FOUND = { code: "NOT_FOUND" }

describe("household boundary", () => {
  it("returns NOT_FOUND for every id-taking service across households", async () => {
    const owner = await fixtures.createHousehold()
    const intruder = (await fixtures.createHousehold()).context
    const { list, item } = await listWithItem(owner.context)
    const alternative = item.alternatives[0]!

    await expect(
      updateShoppingList(intruder, list.id, { name: "x" })
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(deleteShoppingList(intruder, list.id)).rejects.toMatchObject(
      NOT_FOUND
    )
    await expect(
      setShoppingListPrivacy(intruder, list.id, true)
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      addShoppingItems(intruder, list.id, [{ name: "x" }])
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      updateShoppingItem(intruder, item.id, { name: "x" })
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      setShoppingItemStatus(intruder, [item.id], "PURCHASED")
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      toggleShoppingItemPurchased(intruder, item.id)
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(deleteShoppingItem(intruder, item.id)).rejects.toMatchObject(
      NOT_FOUND
    )
    await expect(
      addProductAlternative(intruder, item.id, { name: "x" })
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      updateProductAlternative(intruder, alternative.id, { name: "x" })
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      deleteProductAlternative(intruder, alternative.id)
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      setPreferredAlternative(intruder, item.id, alternative.id)
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      reorderAlternatives(intruder, item.id, [alternative.id])
    ).rejects.toMatchObject(NOT_FOUND)

    const untouched = await db.shoppingItem.findUniqueOrThrow({
      where: { id: item.id },
      include: { alternatives: true },
    })
    expect(untouched).toMatchObject({ name: "Kaffetrakter", status: "PENDING" })
    expect(untouched.alternatives).toHaveLength(2)
  })

  it("treats a malformed id as NOT_FOUND rather than an internal error", async () => {
    const { context } = await fixtures.createHousehold()

    await expect(
      updateShoppingItem(context, "not-a-uuid", { name: "x" })
    ).rejects.toMatchObject(NOT_FOUND)
  })

  it("rejects a category from another household", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const foreignCategory = await db.category.create({
      data: { name: "Fremmed", householdId: other.householdId },
    })
    const { item } = await listWithItem(owner.context)

    await expect(
      updateShoppingItem(owner.context, item.id, {
        categoryId: foreignCategory.id,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("rejects an assignee who is not a household member", async () => {
    const owner = await fixtures.createHousehold()
    const outsider = await fixtures.createHousehold()
    const { item } = await listWithItem(owner.context)

    await expect(
      updateShoppingItem(owner.context, item.id, {
        assignedToId: outsider.userId,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })
})

describe("private lists", () => {
  it("hide items and alternatives from other members of the same household", async () => {
    const { context: creator, householdId } = await fixtures.createHousehold()
    const member = await fixtures.addMember(householdId)
    const { list, item } = await listWithItem(creator, { isPrivate: true })
    const alternative = item.alternatives[0]!

    await expect(
      addShoppingItems(member, list.id, [{ name: "x" }])
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      updateShoppingItem(member, item.id, { name: "x" })
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      setShoppingItemStatus(member, [item.id], "SKIPPED")
    ).rejects.toMatchObject(NOT_FOUND)
    // These four only checked the household before; a member could edit the
    // alternatives of someone else's private list.
    await expect(
      addProductAlternative(member, item.id, { name: "x" })
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      updateProductAlternative(member, alternative.id, { price: 1 })
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      deleteProductAlternative(member, alternative.id)
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      setPreferredAlternative(member, item.id, item.alternatives[1]!.id)
    ).rejects.toMatchObject(NOT_FOUND)

    const alternatives = await db.productAlternative.findMany({
      where: { itemId: item.id },
      orderBy: { rank: "asc" },
    })
    expect(alternatives.map((entry) => entry.name)).toEqual([
      "Moccamaster",
      "Wilfa",
    ])
  })

  it("let only the creator change privacy", async () => {
    const { context: creator, householdId } = await fixtures.createHousehold()
    const member = await fixtures.addMember(householdId)
    const list = await createShoppingList(creator, { name: "Felles" })

    await expect(
      setShoppingListPrivacy(member, list.id, true)
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    const updated = await setShoppingListPrivacy(creator, list.id, true)
    expect(updated.isPrivate).toBe(true)
  })
})

describe("item status", () => {
  it("is idempotent: a retry keeps the original purchasedAt and updatedAt", async () => {
    const { context } = await fixtures.createHousehold()
    const { item } = await listWithItem(context)

    const [first] = await setShoppingItemStatus(context, [item.id], "PURCHASED")
    const [second] = await setShoppingItemStatus(
      context,
      [item.id],
      "PURCHASED"
    )

    expect(first!.purchasedAt).not.toBeNull()
    expect(second!.purchasedAt).toEqual(first!.purchasedAt)
    expect(second!.updatedAt).toEqual(first!.updatedAt)

    const [pending] = await setShoppingItemStatus(context, [item.id], "PENDING")
    expect(pending).toMatchObject({ status: "PENDING", purchasedAt: null })
  })

  it("changes nothing if any id is not visible", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const mine = await listWithItem(owner.context)
    const theirs = await listWithItem(other.context)

    await expect(
      setShoppingItemStatus(
        owner.context,
        [mine.item.id, theirs.item.id],
        "PURCHASED"
      )
    ).rejects.toMatchObject(NOT_FOUND)

    const after = await db.shoppingItem.findUniqueOrThrow({
      where: { id: mine.item.id },
    })
    expect(after.status).toBe("PENDING")
  })

  it("keeps purchasedAt when an update does not mention status", async () => {
    const { context } = await fixtures.createHousehold()
    const { item } = await listWithItem(context)
    const [purchased] = await setShoppingItemStatus(
      context,
      [item.id],
      "PURCHASED"
    )

    const renamed = await updateShoppingItem(context, item.id, {
      name: "Ny trakter",
    })

    expect(renamed.status).toBe("PURCHASED")
    expect(renamed.purchasedAt).toEqual(purchased!.purchasedAt)
  })

  it("sets purchasedAt once through update and clears it on leaving PURCHASED", async () => {
    const { context } = await fixtures.createHousehold()
    const { item } = await listWithItem(context)

    const bought = await updateShoppingItem(context, item.id, {
      status: "PURCHASED",
    })
    const again = await updateShoppingItem(context, item.id, {
      status: "PURCHASED",
    })
    const skipped = await updateShoppingItem(context, item.id, {
      status: "SKIPPED",
    })

    expect(bought.purchasedAt).not.toBeNull()
    expect(again.purchasedAt).toEqual(bought.purchasedAt)
    expect(skipped.purchasedAt).toBeNull()
  })

  it("toggles for the web checkbox", async () => {
    const { context } = await fixtures.createHousehold()
    const { item } = await listWithItem(context)

    expect((await toggleShoppingItemPurchased(context, item.id)).status).toBe(
      "PURCHASED"
    )
    expect((await toggleShoppingItemPurchased(context, item.id)).status).toBe(
      "PENDING"
    )
  })
})

describe("adding items", () => {
  it("skips names already on the list or repeated in the batch", async () => {
    const { context } = await fixtures.createHousehold()
    const { list, item } = await listWithItem(context)

    const result = await addShoppingItems(context, list.id, [
      { name: "KAFFETRAKTER " },
      { name: "Brødrister" },
      { name: "brødrister" },
    ])

    expect(result.created.map((created) => created.name)).toEqual([
      "Brødrister",
    ])
    expect(result.skipped).toEqual([
      { name: "KAFFETRAKTER", existingItemId: item.id },
      { name: "brødrister", existingItemId: result.created[0]!.id },
    ])
  })

  it("creates duplicates when asked to", async () => {
    const { context } = await fixtures.createHousehold()
    const { list } = await listWithItem(context)

    const result = await addShoppingItems(
      context,
      list.id,
      [{ name: "Kaffetrakter" }],
      {
        onDuplicate: "create",
      }
    )
    expect(result.created).toHaveLength(1)
  })

  it(`rejects more than ${MAX_BATCH_SIZE} items and creates none`, async () => {
    const { context } = await fixtures.createHousehold()
    const list = await createShoppingList(context, { name: "Stor" })
    const items = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, index) => ({
      name: `Vare ${index}`,
    }))

    await expect(
      addShoppingItems(context, list.id, items)
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    })
    await expect(
      bulkCreateShoppingItems(context, {
        listId: list.id,
        items,
        categoryMap: {},
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    expect(await db.shoppingItem.count({ where: { listId: list.id } })).toBe(0)
  })

  it("is all-or-nothing: one invalid item stops the batch", async () => {
    const { context } = await fixtures.createHousehold()
    const list = await createShoppingList(context, { name: "Batch" })

    await expect(
      addShoppingItems(context, list.id, [
        { name: "Ok" },
        { name: "Dårlig", url: "ftp://x" },
      ])
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    expect(await db.shoppingItem.count({ where: { listId: list.id } })).toBe(0)
  })
})

describe("LLM import with duplicates", () => {
  it("rejects an update id from another household and changes nothing", async () => {
    const owner = await fixtures.createHousehold()
    const victim = await fixtures.createHousehold()
    const mine = await listWithItem(owner.context)
    const theirs = await listWithItem(victim.context)

    await expect(
      bulkImportShoppingItemsWithDuplicates(owner.context, {
        listId: mine.list.id,
        categoryMap: {},
        newItems: [{ name: "Ny vare" }],
        updates: [{ id: theirs.item.id, fields: { description: "kapret" } }],
      })
    ).rejects.toMatchObject(NOT_FOUND)

    const victimItem = await db.shoppingItem.findUniqueOrThrow({
      where: { id: theirs.item.id },
    })
    expect(victimItem.description).toBeNull()
    expect(
      await db.shoppingItem.count({ where: { listId: mine.list.id } })
    ).toBe(1)
  })

  it("rejects an update id from another list in the same household", async () => {
    const { context } = await fixtures.createHousehold()
    const first = await listWithItem(context)
    const second = await listWithItem(context)

    await expect(
      bulkImportShoppingItemsWithDuplicates(context, {
        listId: first.list.id,
        categoryMap: {},
        newItems: [],
        updates: [{ id: second.item.id, fields: { storeName: "Elkjøp" } }],
      })
    ).rejects.toMatchObject(NOT_FOUND)
  })

  it("rejects a category map pointing at another household", async () => {
    const owner = await fixtures.createHousehold()
    const other = await fixtures.createHousehold()
    const foreign = await db.category.create({
      data: { name: "Fremmed", householdId: other.householdId },
    })
    const { list } = await listWithItem(owner.context)

    await expect(
      bulkCreateShoppingItems(owner.context, {
        listId: list.id,
        categoryMap: { Fremmed: foreign.id },
        items: [{ name: "Sofa", categoryName: "Fremmed" }],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("applies updates on the same list", async () => {
    const { context } = await fixtures.createHousehold()
    const { list, item } = await listWithItem(context)

    const result = await bulkImportShoppingItemsWithDuplicates(context, {
      listId: list.id,
      categoryMap: {},
      newItems: [{ name: "Vannkoker", priority: "NOT_A_PRIORITY" as never }],
      updates: [{ id: item.id, fields: { storeName: "Elkjøp" } }],
    })

    expect(result.count).toBe(2)
    const items = await db.shoppingItem.findMany({ where: { listId: list.id } })
    expect(items.find((entry) => entry.id === item.id)?.storeName).toBe(
      "Elkjøp"
    )
    // The import is deliberately lenient about pasted enum values.
    expect(items.find((entry) => entry.name === "Vannkoker")?.priority).toBe(
      "MEDIUM"
    )
  })
})

describe("alternatives", () => {
  it("sets the preferred alternative idempotently", async () => {
    const { context } = await fixtures.createHousehold()
    const { item } = await listWithItem(context)
    const wilfa = item.alternatives[1]!

    const first = await setPreferredAlternative(context, item.id, wilfa.id)
    const second = await setPreferredAlternative(context, item.id, wilfa.id)

    expect(first.item.alternatives.map((entry) => entry.name)).toEqual([
      "Wilfa",
      "Moccamaster",
    ])
    expect(second.item.alternatives.map((entry) => entry.rank)).toEqual([0, 1])
  })

  it("rejects an alternative that belongs to another item", async () => {
    const { context } = await fixtures.createHousehold()
    const first = await listWithItem(context)
    const second = await listWithItem(context)

    await expect(
      setPreferredAlternative(
        context,
        first.item.id,
        second.item.alternatives[0]!.id
      )
    ).rejects.toMatchObject(NOT_FOUND)
    await expect(
      reorderAlternatives(context, first.item.id, [
        second.item.alternatives[0]!.id,
        first.item.alternatives[0]!.id,
      ])
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("appends new alternatives after the existing ones", async () => {
    const { context } = await fixtures.createHousehold()
    const { item } = await listWithItem(context)

    const { alternative } = await addProductAlternative(context, item.id, {
      name: "Bialetti",
    })
    expect(alternative.rank).toBe(2)
  })
})

describe("optimistic concurrency", () => {
  it("rejects a stale expectedUpdatedAt with CONFLICT", async () => {
    const { context } = await fixtures.createHousehold()
    const { list, item } = await listWithItem(context)
    await updateShoppingItem(context, item.id, { storeName: "Power" })

    await expect(
      updateShoppingItem(context, item.id, {
        storeName: "Elkjøp",
        expectedUpdatedAt: item.updatedAt,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })

    await updateShoppingList(context, list.id, { name: "Endret" })
    await expect(
      updateShoppingList(context, list.id, {
        name: "Igjen",
        expectedUpdatedAt: list.updatedAt,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})

describe("shopping write tools", () => {
  it("add-shopping-items reports skips and records an audit row", async () => {
    const { context } = await fixtures.createHousehold()
    const { list, item } = await listWithItem(context)
    const session = fixtures.session(context, ["shopping:write"])

    const result = await tool("add-shopping-items").invoke(
      {
        listId: list.id,
        items: [
          { name: "Kaffetrakter" },
          { name: "Kaffebønner", estimatedPrice: 129.9 },
        ],
      },
      session
    )

    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toMatchObject({
      created: [{ name: "Kaffebønner", estimatedPrice: "129.9" }],
      skipped: [{ name: "Kaffetrakter", existingItemId: item.id }],
    })
    const audit = await db.mcpAuditEvent.findFirstOrThrow({
      where: { correlationId: session.correlationId },
    })
    expect(audit).toMatchObject({
      toolName: "add-shopping-items",
      resourceType: "shopping_list",
      resourceId: list.id,
      outcome: "success",
    })
  })

  it("set-shopping-item-status on another user's private list is NOT_FOUND", async () => {
    const { context: creator, householdId } = await fixtures.createHousehold()
    const member = await fixtures.addMember(householdId)
    const { item } = await listWithItem(creator, { isPrivate: true })
    const session = fixtures.session(member, ["shopping:write"])

    const result = await tool("set-shopping-item-status").invoke(
      { itemIds: [item.id], status: "PURCHASED" },
      session
    )

    expect(result.structuredContent).toMatchObject({
      error: { code: "NOT_FOUND" },
    })
    const audit = await db.mcpAuditEvent.findFirstOrThrow({
      where: { correlationId: session.correlationId },
    })
    expect(audit.outcome).toBe("not_found")
  })

  it("never returns the assignee", async () => {
    const { context } = await fixtures.createHousehold()
    const { item } = await listWithItem(context)
    await updateShoppingItem(context, item.id, { assignedToId: context.userId })

    const result = await tool("update-shopping-item").invoke(
      { itemId: item.id, storeName: "Elkjøp" },
      fixtures.session(context, ["shopping:write"])
    )

    const serialized = JSON.stringify(result.structuredContent)
    expect(serialized).not.toContain("assignedTo")
    expect(serialized).not.toContain(context.userId)
  })
})
