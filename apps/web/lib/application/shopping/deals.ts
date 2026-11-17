import { db, Prisma } from "@workspace/db"

import { toOsloDay } from "../../dashboard-stats"
import { getVisibleShoppingListsWhere } from "../../shopping-list-access"
import type { ApplicationContext } from "../context"
import {
  MAX_NAME_LENGTH,
  assertBatchSize,
  definedFields,
  moneyAmount,
  notFound,
  optionalCalendarDate,
  optionalMoneyAmount,
  optionalText,
  optionalUrl,
  requiredText,
  validationError,
} from "../mutations"
import { parseCalendarDate } from "../serialization"

/**
 * Deal watching: the household marks shopping items it wants to buy on offer,
 * an assistant with web access checks the stores (typically from a scheduled
 * job) and reports the best offer it finds. The server never reads the stores
 * itself.
 *
 * Reports write only to `ShoppingItemDeal` and `dealCheckedAt`, never to the
 * item's own fields or `updatedAt`, so a job running in the background cannot
 * collide with the household's edits.
 *
 * Every item is reached through its list's visibility rule, as in `write.ts`:
 * an item on someone else's private list is NOT_FOUND.
 */

const ITEM = "vare"

/** An offer without an end date counts as current this long after the report. */
export const DEAL_WITHOUT_END_DATE_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertItemIds(ids: string[]) {
  for (const id of ids) {
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) throw notFound(ITEM)
  }
  if (new Set(ids).size !== ids.length) {
    throw validationError("Samme vare kan bare stå én gang per kall.")
  }
}

function visibleLists(context: ApplicationContext) {
  return getVisibleShoppingListsWhere(context.householdId, context.userId)
}

// ─── What counts as current ─────────────────────────────────────

/** Today's date in Norway, as UTC midnight like the `@db.Date` columns. */
export function dealToday(now: Date = new Date()) {
  return parseCalendarDate(toOsloDay(now))
}

/**
 * An offer is current through its last day in Norway, or for
 * `DEAL_WITHOUT_END_DATE_DAYS` after it was reported when the store gave no
 * end date. An offer that has not started yet is current too: it is worth
 * knowing about ahead of time.
 */
export function currentDealWhere(
  now: Date = new Date()
): Prisma.ShoppingItemDealWhereInput {
  return {
    OR: [
      { validTo: { gte: dealToday(now) } },
      {
        validTo: null,
        reportedAt: {
          gte: new Date(now.getTime() - DEAL_WITHOUT_END_DATE_DAYS * DAY_MS),
        },
      },
    ],
  }
}

export function isDealCurrent(
  deal: { validTo: Date | null; reportedAt: Date },
  now: Date = new Date()
) {
  if (deal.validTo) return deal.validTo.getTime() >= dealToday(now).getTime()
  return (
    deal.reportedAt.getTime() >=
    now.getTime() - DEAL_WITHOUT_END_DATE_DAYS * DAY_MS
  )
}

// ─── Result shapes ──────────────────────────────────────────────

export const SHOPPING_DEAL_SELECT = {
  store: true,
  productName: true,
  price: true,
  regularPrice: true,
  priceNote: true,
  url: true,
  validFrom: true,
  validTo: true,
  reportedAt: true,
} satisfies Prisma.ShoppingItemDealSelect

export type ShoppingDealRow = Prisma.ShoppingItemDealGetPayload<{
  select: typeof SHOPPING_DEAL_SELECT
}>

export const DEAL_WATCH_RESULT_SELECT = {
  id: true,
  name: true,
  listId: true,
  status: true,
  dealWatch: true,
  dealWatchNote: true,
  dealTargetPrice: true,
  dealCheckedAt: true,
} satisfies Prisma.ShoppingItemSelect

export type DealWatchResult = Prisma.ShoppingItemGetPayload<{
  select: typeof DEAL_WATCH_RESULT_SELECT
}>

// ─── Reads ──────────────────────────────────────────────────────

type PageOptions = { limit: number; offset: number }

/**
 * Current offers on items that are still to be bought, across every list the
 * caller can see. The offer that ends first comes first.
 */
export async function listCurrentShoppingDeals(
  context: ApplicationContext,
  options: Partial<PageOptions> & { listId?: string; now?: Date } = {}
) {
  const where: Prisma.ShoppingItemDealWhereInput = {
    ...currentDealWhere(options.now),
    item: {
      status: "PENDING",
      list: visibleLists(context),
      ...(options.listId ? { listId: options.listId } : {}),
    },
  }

  const [totalCount, deals] = await Promise.all([
    db.shoppingItemDeal.count({ where }),
    db.shoppingItemDeal.findMany({
      where,
      select: {
        ...SHOPPING_DEAL_SELECT,
        item: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            estimatedPrice: true,
            dealWatch: true,
            dealTargetPrice: true,
            list: { select: { id: true, name: true, isPrivate: true } },
            alternatives: {
              select: { price: true, imageUrl: true },
              orderBy: [{ rank: "asc" }, { id: "asc" }],
              take: 1,
            },
          },
        },
      },
      orderBy: [
        { validTo: { sort: "asc", nulls: "last" } },
        { reportedAt: "desc" },
        { itemId: "asc" },
      ],
      skip: options.offset,
      take: options.limit,
    }),
  ])

  return { totalCount, deals }
}

export type CurrentShoppingDeal = Awaited<
  ReturnType<typeof listCurrentShoppingDeals>
>["deals"][number]

/**
 * Items still to be bought that the household watches, with what an assistant
 * needs to search for them. The least recently checked come first, so a job
 * that cannot cover everything in one run gets to the rest next time.
 */
export async function listDealWatchItemsPage(
  context: ApplicationContext,
  options: PageOptions
) {
  const where: Prisma.ShoppingItemWhereInput = {
    dealWatch: true,
    status: "PENDING",
    list: visibleLists(context),
  }

  const [totalCount, items] = await Promise.all([
    db.shoppingItem.count({ where }),
    db.shoppingItem.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        url: true,
        storeName: true,
        estimatedPrice: true,
        dealWatchNote: true,
        dealTargetPrice: true,
        dealCheckedAt: true,
        category: { select: { name: true } },
        list: { select: { id: true, name: true } },
        alternatives: {
          select: { name: true, price: true, storeName: true, url: true },
          orderBy: [{ rank: "asc" }, { id: "asc" }],
          take: 5,
        },
        deal: { select: SHOPPING_DEAL_SELECT },
      },
      orderBy: [
        { dealCheckedAt: { sort: "asc", nulls: "first" } },
        { name: "asc" },
        { id: "asc" },
      ],
      skip: options.offset,
      take: options.limit,
    }),
  ])

  return { totalCount, items }
}

// ─── Watching ───────────────────────────────────────────────────

export type DealWatchChange = {
  itemId: string
  watch: boolean
  /** Omit to keep, `null` or "" to clear. */
  note?: string | null
  /** NOK. Omit to keep, `null` to clear. */
  targetPrice?: number | null
}

/**
 * Turns deal watching on or off for 1..MAX_BATCH_SIZE items, all or nothing.
 * Turning it off keeps a reported offer: it is still true, and the household
 * can remove it on its own.
 */
export async function setDealWatch(
  context: ApplicationContext,
  changes: DealWatchChange[]
): Promise<DealWatchResult[]> {
  assertBatchSize(changes.length, "Varer")
  const ids = changes.map((change) => change.itemId)
  assertItemIds(ids)

  const normalized = changes.map((change) => {
    if (typeof change.watch !== "boolean") {
      throw validationError("Følg med må være sann eller usann.")
    }
    return {
      itemId: change.itemId,
      data: definedFields({
        dealWatch: change.watch,
        dealWatchNote: optionalText(change.note, "Tilbudsnotat"),
        dealTargetPrice: optionalMoneyAmount(change.targetPrice, "Målpris"),
      }),
    }
  })

  const where = { id: { in: ids }, list: visibleLists(context) }

  return db.$transaction(async (tx) => {
    if ((await tx.shoppingItem.count({ where })) !== ids.length) {
      throw notFound(ITEM)
    }

    for (const { itemId, data } of normalized) {
      // The boundary is repeated in each write, so an item that moved out of
      // reach since the count rolls the whole call back.
      const { count } = await tx.shoppingItem.updateMany({
        where: { id: itemId, list: visibleLists(context) },
        data,
      })
      if (count !== 1) throw notFound(ITEM)
    }

    return tx.shoppingItem.findMany({
      where: { id: { in: ids } },
      select: DEAL_WATCH_RESULT_SELECT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    })
  })
}

// ─── Reporting offers ───────────────────────────────────────────

export type ShoppingDealFields = {
  store: string
  /** NOK, what the item costs on this offer. */
  price: number
  regularPrice?: number | null
  productName?: string | null
  priceNote?: string | null
  url?: string | null
  /** `Date` or `YYYY-MM-DD`. */
  validFrom?: Date | string | null
  /** Last day of the offer. `Date` or `YYYY-MM-DD`. */
  validTo?: Date | string | null
}

export type ShoppingDealReport = {
  itemId: string
  /** The best current offer, or `null` when the check found none. */
  deal: ShoppingDealFields | null
}

export type ShoppingDealReportStatus =
  /** A new offer on the item. */
  | "added"
  /** Replaced the item's previous offer. */
  | "updated"
  /** No offer found; the previous one was removed. */
  | "cleared"
  /** No offer found and none was stored. */
  | "none"

export type ReportShoppingDealsResult = {
  results: Array<{
    itemId: string
    name: string
    listId: string
    status: ShoppingDealReportStatus
  }>
  /** Offers not saved because their last day has passed. Nothing changed. */
  skipped: Array<{ itemId: string; name: string; reason: "EXPIRED" }>
}

function normalizeDeal(input: ShoppingDealFields) {
  if (typeof input.price !== "number") {
    throw validationError("Tilbudspris må være et tall.")
  }
  const validFrom = optionalCalendarDate(input.validFrom, "Gyldig fra") ?? null
  const validTo = optionalCalendarDate(input.validTo, "Gyldig til") ?? null
  if (validFrom && validTo && validFrom > validTo) {
    throw validationError("Gyldig fra kan ikke være etter gyldig til.")
  }

  return {
    store: requiredText(input.store, "Butikk"),
    price: moneyAmount(input.price, "Tilbudspris"),
    regularPrice:
      optionalMoneyAmount(input.regularPrice, "Ordinær pris") ?? null,
    productName:
      optionalText(input.productName, "Produkt", MAX_NAME_LENGTH) ?? null,
    priceNote: optionalText(input.priceNote, "Vilkår") ?? null,
    url: optionalUrl(input.url, "URL") ?? null,
    validFrom,
    validTo,
  }
}

/**
 * Records the outcome of a deal check for 1..MAX_BATCH_SIZE items, all or
 * nothing. Each item gets the reported offer (replacing any earlier one) or,
 * with `deal: null`, loses the one it had. Every checked item gets
 * `dealCheckedAt`. Repeating a report sets the same end state.
 */
export async function reportShoppingDeals(
  context: ApplicationContext,
  reports: ShoppingDealReport[],
  now: Date = new Date()
): Promise<ReportShoppingDealsResult> {
  assertBatchSize(reports.length, "Varer")
  const ids = reports.map((report) => report.itemId)
  assertItemIds(ids)

  const today = dealToday(now)
  const normalized = reports.map((report) => ({
    itemId: report.itemId,
    deal: report.deal === null ? null : normalizeDeal(report.deal),
  }))

  return db.$transaction(async (tx) => {
    const items = await tx.shoppingItem.findMany({
      where: { id: { in: ids }, list: visibleLists(context) },
      select: {
        id: true,
        name: true,
        listId: true,
        deal: { select: { id: true } },
      },
    })
    if (items.length !== ids.length) throw notFound(ITEM)
    const byId = new Map(items.map((item) => [item.id, item]))

    const result: ReportShoppingDealsResult = { results: [], skipped: [] }
    const checked: string[] = []

    for (const { itemId, deal } of normalized) {
      const item = byId.get(itemId)!

      if (deal?.validTo && deal.validTo < today) {
        result.skipped.push({ itemId, name: item.name, reason: "EXPIRED" })
        continue
      }

      let status: ShoppingDealReportStatus
      if (deal === null) {
        const { count } = await tx.shoppingItemDeal.deleteMany({
          where: { itemId },
        })
        status = count > 0 ? "cleared" : "none"
      } else {
        const fields = { ...deal, reportedAt: now }
        await tx.shoppingItemDeal.upsert({
          where: { itemId },
          create: { itemId, ...fields },
          update: fields,
        })
        status = item.deal ? "updated" : "added"
      }

      checked.push(itemId)
      result.results.push({
        itemId,
        name: item.name,
        listId: item.listId,
        status,
      })
    }

    if (checked.length > 0) {
      // Raw SQL so the item's `updatedAt` stays the household's last edit: a
      // background check must not turn someone's `expectedUpdatedAt` stale.
      // Ownership was settled by the visible read above, in this transaction.
      await tx.$executeRaw`
        UPDATE "ShoppingItem"
        SET "dealCheckedAt" = ${now}
        WHERE "id" IN (${Prisma.join(checked.map((id) => Prisma.sql`${id}::uuid`))})
      `
    }

    return result
  })
}

/** The web's "remove offer" button. */
export async function clearShoppingItemDeal(
  context: ApplicationContext,
  itemId: string
) {
  assertItemIds([itemId])

  return db.$transaction(async (tx) => {
    const item = await tx.shoppingItem.findFirst({
      where: { id: itemId, list: visibleLists(context) },
      select: { id: true, listId: true },
    })
    if (!item) throw notFound(ITEM)

    await tx.shoppingItemDeal.deleteMany({ where: { itemId } })
    return item
  })
}
