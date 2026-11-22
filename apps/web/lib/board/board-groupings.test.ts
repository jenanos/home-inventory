import { describe, expect, it } from "vitest"

import {
  applyProjectPatch,
  projectColumnKey,
  projectColumns,
  projectMovePatch,
  type ProjectBoardFields,
} from "./project-board"
import {
  NONE_KEY,
  SHOPPING_GROUPINGS,
  applyShoppingPatch,
  shoppingColumnKey,
  shoppingColumns,
  shoppingMovePatch,
  type ShoppingBoardContext,
} from "./shopping-board"
import { PROJECT_GROUPINGS } from "./project-board"
import type { ShoppingItemData } from "@/lib/shopping-item-view"

const LIST_A = "11111111-1111-4111-8111-111111111111"
const LIST_B = "22222222-2222-4222-8222-222222222222"
const CATEGORY = "33333333-3333-4333-8333-333333333333"
const MEMBER = "44444444-4444-4444-8444-444444444444"

const context: ShoppingBoardContext = {
  lists: [
    { id: LIST_A, name: "Kjøkken", color: null, isPrivate: false },
    { id: LIST_B, name: "Mitt", color: null, isPrivate: true },
  ],
  categories: [{ id: CATEGORY, name: "Verktøy", icon: null, color: null }],
  members: [{ id: MEMBER, name: "Kari", email: "kari@example.com" }],
  today: "2026-11-18",
}

const item: ShoppingItemData = {
  id: "item-1",
  name: "Drill",
  description: null,
  priority: "MEDIUM",
  dueDate: null,
  estimatedPrice: 1000,
  effectivePrice: 1000,
  url: null,
  imageUrl: null,
  storeName: null,
  status: "PENDING",
  purchasedAt: null,
  category: null,
  assignedTo: null,
  alternatives: [],
  dealWatch: false,
  dealWatchNote: null,
  dealTargetPrice: null,
  dealCheckedAt: null,
  deal: null,
  listId: LIST_A,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
}

describe("shopping board", () => {
  it("puts every item in one of the grouping's columns", () => {
    for (const { id } of SHOPPING_GROUPINGS) {
      const keys = shoppingColumns(id, context).map((column) => column.key)
      expect(keys).toContain(shoppingColumnKey(item, id, context))
    }
  })

  it("lands a moved item in the column it was dropped in", () => {
    for (const { id } of SHOPPING_GROUPINGS) {
      for (const column of shoppingColumns(id, context)) {
        const patch = shoppingMovePatch(id, column.key, context)
        expect(patch === null).toBe(!column.droppable)
        if (!patch) continue
        const moved = applyShoppingPatch(item, patch, context)
        expect(shoppingColumnKey(moved, id, context)).toBe(column.key)
      }
    }
  })

  it("turns a drop into the field it groups on", () => {
    expect(shoppingMovePatch("liste", LIST_B, context)).toEqual({
      listId: LIST_B,
    })
    expect(shoppingMovePatch("kategori", NONE_KEY, context)).toEqual({
      categoryId: null,
    })
    expect(shoppingMovePatch("ansvarlig", MEMBER, context)).toEqual({
      assignedToId: MEMBER,
    })
    expect(shoppingMovePatch("status", "PURCHASED", context)).toEqual({
      status: "PURCHASED",
    })
  })

  it("shows items assigned to a former member as unassigned", () => {
    const former = {
      ...item,
      assignedTo: { id: "gone", name: "Tidligere", email: "x@example.com" },
    }
    expect(shoppingColumnKey(former, "ansvarlig", context)).toBe(NONE_KEY)
  })

  it("ignores columns it does not know", () => {
    expect(shoppingMovePatch("liste", "unknown", context)).toBeNull()
    expect(shoppingMovePatch("prioritet", "URGENT", context)).toBeNull()
    expect(shoppingMovePatch("kategori", "unknown", context)).toBeNull()
  })

  it("sets and clears purchasedAt with the status", () => {
    const bought = applyShoppingPatch(item, { status: "PURCHASED" }, context)
    expect(bought.purchasedAt).not.toBeNull()
    expect(
      applyShoppingPatch(bought, { status: "PENDING" }, context).purchasedAt
    ).toBeNull()
  })
})

describe("project board", () => {
  const project: ProjectBoardFields = {
    title: "Rense takrenner",
    status: "NOT_STARTED",
    priority: "HIGH",
    dueDate: null,
    type: "MAINTENANCE",
    scale: "ROUTINE",
    execution: null,
  }

  it("lands a moved project in the column it was dropped in", () => {
    for (const { id } of PROJECT_GROUPINGS) {
      const columns = projectColumns(id, context.today)
      expect(columns.map((column) => column.key)).toContain(
        projectColumnKey(project, id, context.today)
      )
      for (const column of columns) {
        const patch = projectMovePatch(id, column.key, context.today)
        expect(patch === null).toBe(!column.droppable)
        if (!patch) continue
        const moved = applyProjectPatch(project, patch)
        expect(projectColumnKey(moved, id, context.today)).toBe(column.key)
      }
    }
  })

  it("clears the execution in the undecided column", () => {
    expect(projectMovePatch("utforelse", NONE_KEY, context.today)).toEqual({
      execution: null,
    })
  })
})
