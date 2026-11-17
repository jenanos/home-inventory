import { z } from "zod"

import {
  dealToday,
  listCurrentShoppingDeals,
  listDealWatchItemsPage,
  reportShoppingDeals,
  setDealWatch,
  type ShoppingDealRow,
} from "../../application/shopping/deals"
import { MAX_BATCH_SIZE } from "../../application/mutations"
import { getShoppingListItemEffectivePrice } from "../../shopping-list-pricing"
import {
  buildPageInfo,
  pageInfoSchema,
  paginationInputSchema,
  resolvePageRequest,
} from "../pagination"
import { toolSuccess } from "../result"
import {
  defineTool,
  defineWriteTool,
  READ_ONLY_ANNOTATIONS,
  UPDATE_ANNOTATIONS,
  type McpToolDefinition,
} from "./define"
import {
  calculated,
  calculatedMoneySchema,
  calendarDate,
  calendarDateInputSchema,
  calendarDateOutputSchema,
  idSchema,
  money,
  moneyInputSchema,
  nameInputSchema,
  optionalTimestamp,
  shortTextInputSchema,
  storedMoneySchema,
  timestamp,
  timestampSchema,
  urlInputSchema,
} from "./shared"

/**
 * Deal watching (ADR 0013). The server never reads the stores: an assistant
 * with web access gets the watched items, searches the stores' campaigns
 * itself, and reports the best current offer per item.
 */

const todaySchema = z
  .string()
  .describe(
    "Today's date in Norway (YYYY-MM-DD). Offers end on their last day there."
  )

export const shoppingDealSchema = z.object({
  store: z.string(),
  productName: z
    .string()
    .nullable()
    .describe("The concrete product on offer, if reported."),
  price: storedMoneySchema.describe("Offer price in NOK as a decimal string."),
  regularPrice: storedMoneySchema.describe(
    "Ordinary price in NOK, if reported."
  ),
  savingsPercent: z
    .number()
    .int()
    .nullable()
    .describe(
      "How much below the regular price, rounded down. Null without a regular price."
    ),
  priceNote: z
    .string()
    .nullable()
    .describe("Conditions, e.g. 'med medlemskort'."),
  url: z.string().nullable(),
  validFrom: calendarDateOutputSchema,
  validTo: calendarDateOutputSchema.describe(
    "Last day of the offer. Null when the store gave none: the offer then counts as current for a week after reportedAt."
  ),
  reportedAt: timestampSchema,
})

function savingsPercent(deal: ShoppingDealRow) {
  if (!deal.regularPrice) return null
  const regular = deal.regularPrice.toNumber()
  if (regular <= 0) return null
  const saved = (regular - deal.price.toNumber()) / regular
  return saved > 0 ? Math.floor(saved * 100) : 0
}

export function serializeShoppingDeal(
  deal: ShoppingDealRow
): z.infer<typeof shoppingDealSchema> {
  return {
    store: deal.store,
    productName: deal.productName,
    price: money(deal.price) ?? "0",
    regularPrice: money(deal.regularPrice),
    savingsPercent: savingsPercent(deal),
    priceNote: deal.priceNote,
    url: deal.url,
    validFrom: calendarDate(deal.validFrom),
    validTo: calendarDate(deal.validTo),
    reportedAt: timestamp(deal.reportedAt),
  }
}

export function createShoppingDealTools(
  now: () => Date = () => new Date()
): McpToolDefinition[] {
  const listShoppingDealsTool = defineTool({
    name: "list-shopping-deals",
    scope: "shopping:read",
    title: "List current offers on shopping items",
    description:
      "Answers 'is anything we want to buy on offer now?': the current store offers reported for items that are still to be bought, across every list the user can see, the offer that ends first first. Expired offers and items already bought or skipped are left out. Offers are only as fresh as the last check; use list-deal-watch-items to check again.",
    inputSchema: {
      listId: idSchema.optional().describe("Limit to one list."),
      ...paginationInputSchema,
    },
    outputSchema: {
      today: todaySchema,
      deals: z.array(
        z.object({
          item: z.object({
            id: z.string(),
            name: z.string(),
            list: z.object({ id: z.string(), name: z.string() }),
            watched: z
              .boolean()
              .describe("Whether the household watches the item for offers."),
            targetPrice: storedMoneySchema.describe(
              "The price the household hoped for, if set."
            ),
            plannedPrice: calculatedMoneySchema.describe(
              "What the household planned to pay: the preferred alternative's price, else the item's estimate. 0.00 when unknown."
            ),
          }),
          deal: shoppingDealSchema,
        })
      ),
      pageInfo: pageInfoSchema,
    },
    annotations: READ_ONLY_ANNOTATIONS,
    handler: async (args, session) => {
      const page = resolvePageRequest(args)
      const at = now()
      const { totalCount, deals } = await listCurrentShoppingDeals(
        session.context,
        { ...page, listId: args.listId, now: at }
      )

      const serialized = deals.map(({ item, ...deal }) => ({
        item: {
          id: item.id,
          name: item.name,
          list: { id: item.list.id, name: item.list.name },
          watched: item.dealWatch,
          targetPrice: money(item.dealTargetPrice),
          plannedPrice: calculated(getShoppingListItemEffectivePrice(item)),
        },
        deal: serializeShoppingDeal(deal),
      }))

      return toolSuccess(
        {
          today: calendarDate(dealToday(at))!,
          deals: serialized,
          pageInfo: buildPageInfo(page, serialized.length, totalCount),
        },
        totalCount === 0
          ? "Ingen aktuelle tilbud på det som står på innkjøpslistene."
          : `Fant ${totalCount} aktuelle tilbud; viser ${serialized.length}.`
      )
    },
  })

  const listDealWatchItemsTool = defineTool({
    name: "list-deal-watch-items",
    scope: "shopping:read",
    title: "List items to check for offers",
    description:
      "The starting point for a deal check: items still to be bought that the household watches for offers, least recently checked first, with what you need to search for them (description, note on what counts as a good offer, target price, the products and stores already considered) and the offer currently stored, if any. Then search the stores' current campaigns on the web yourself (the server does not) and record the result for every item you checked with report-shopping-deals.",
    inputSchema: { ...paginationInputSchema },
    outputSchema: {
      today: todaySchema,
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().nullable(),
          category: z.string().nullable(),
          list: z.object({ id: z.string(), name: z.string() }),
          note: z
            .string()
            .nullable()
            .describe(
              "What counts as a good offer for this item: brand, model, size, condition."
            ),
          targetPrice: storedMoneySchema.describe(
            "An offer at or below this price is worth reporting. Null means use judgement: clearly below the usual price."
          ),
          plannedPrice: calculatedMoneySchema.describe(
            "What the household planned to pay. 0.00 when unknown."
          ),
          url: z.string().nullable(),
          storeName: z.string().nullable(),
          alternatives: z
            .array(
              z.object({
                name: z.string(),
                price: storedMoneySchema,
                storeName: z.string().nullable(),
                url: z.string().nullable(),
              })
            )
            .describe(
              "Products the household is considering, preferred first (at most 5). Offers on any of them count."
            ),
          lastCheckedAt: timestampSchema
            .nullable()
            .describe("When an assistant last reported on this item."),
          currentDeal: shoppingDealSchema
            .nullable()
            .describe("The offer stored now, even if it has expired since."),
        })
      ),
      pageInfo: pageInfoSchema,
    },
    annotations: READ_ONLY_ANNOTATIONS,
    handler: async (args, session) => {
      const page = resolvePageRequest(args)
      const { totalCount, items } = await listDealWatchItemsPage(
        session.context,
        page
      )

      const serialized = items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category?.name ?? null,
        list: { id: item.list.id, name: item.list.name },
        note: item.dealWatchNote,
        targetPrice: money(item.dealTargetPrice),
        plannedPrice: calculated(getShoppingListItemEffectivePrice(item)),
        url: item.url,
        storeName: item.storeName,
        alternatives: item.alternatives.map((alternative) => ({
          name: alternative.name,
          price: money(alternative.price),
          storeName: alternative.storeName,
          url: alternative.url,
        })),
        lastCheckedAt: optionalTimestamp(item.dealCheckedAt),
        currentDeal: item.deal ? serializeShoppingDeal(item.deal) : null,
      }))

      return toolSuccess(
        {
          today: calendarDate(dealToday(now()))!,
          items: serialized,
          pageInfo: buildPageInfo(page, serialized.length, totalCount),
        },
        totalCount === 0
          ? "Ingen varer følges med på for tilbud. Marker varer med set-deal-watch."
          : `${totalCount} vare(r) følges med på for tilbud; viser ${serialized.length}.`
      )
    },
  })

  const setDealWatchTool = defineWriteTool({
    name: "set-deal-watch",
    scope: "shopping:write",
    title: "Watch shopping items for offers",
    description: `Turns deal watching on or off for 1–${MAX_BATCH_SIZE} items, all or nothing. Watched items are returned by list-deal-watch-items for the next deal check. note says what counts as a good offer (brand, model, size); targetPrice is the price worth reporting. Omitted fields keep their value; null clears them. Turning watching off keeps a stored offer. Sets an end state, so repeating the call is harmless.`,
    inputSchema: {
      items: z
        .array(
          z.object({
            itemId: idSchema.describe(
              "Id from get-shopping-list or search-shopping-items."
            ),
            watch: z.boolean(),
            note: shortTextInputSchema.describe(
              "What counts as a good offer, e.g. 'Bosch eller Siemens, minst 8 kg'."
            ),
            targetPrice: moneyInputSchema
              .nullable()
              .optional()
              .describe("Report offers at or below this price, in NOK."),
          })
        )
        .min(1)
        .max(MAX_BATCH_SIZE),
    },
    outputSchema: {
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          listId: z.string(),
          watched: z.boolean(),
          note: z.string().nullable(),
          targetPrice: storedMoneySchema,
        })
      ),
    },
    annotations: UPDATE_ANNOTATIONS,
    resourceType: "shopping_item",
    handler: async (args, session) => {
      const items = await setDealWatch(session.context, args.items)
      const watched = items.filter((item) => item.dealWatch).length

      return {
        structuredContent: {
          items: items.map((item) => ({
            id: item.id,
            name: item.name,
            listId: item.listId,
            watched: item.dealWatch,
            note: item.dealWatchNote,
            targetPrice: money(item.dealTargetPrice),
          })),
        },
        summary: `Følger med på tilbud for ${watched} av ${items.length} vare(r).`,
        resourceId: items.length === 1 ? (items[0]?.id ?? null) : null,
      }
    },
  })

  const reportShoppingDealsTool = defineWriteTool({
    name: "report-shopping-deals",
    scope: "shopping:write",
    title: "Record the result of a deal check",
    description: `Records what a deal check found for 1–${MAX_BATCH_SIZE} items, all or nothing. Give each checked item its best current offer, or deal: null when you found none worth reporting: that removes the item's old offer, so a stale one does not linger. Report every item you checked, so lastCheckedAt shows it was looked at. One offer per item; a new one replaces the old. Only report what you read on the store's or a price service's page — price and dates as stated there, never guessed. An offer whose last day has passed is skipped and nothing changes for that item. The household sees current offers at the top of the shopping page and the overview.`,
    inputSchema: {
      reports: z
        .array(
          z.object({
            itemId: idSchema.describe("Id from list-deal-watch-items."),
            deal: z
              .object({
                store: nameInputSchema.describe(
                  "Store or chain, e.g. 'Elkjøp' or 'Jula'."
                ),
                price: moneyInputSchema.describe(
                  "What the item costs on the offer, in NOK. For a percentage campaign, the price after the discount."
                ),
                regularPrice: moneyInputSchema
                  .nullable()
                  .optional()
                  .describe("The ordinary price in NOK, if stated."),
                productName: nameInputSchema
                  .nullable()
                  .optional()
                  .describe(
                    "The concrete product on offer, e.g. 'Bosch Serie 6 WAU28PH9SN'."
                  ),
                priceNote: shortTextInputSchema.describe(
                  "Conditions that are not a price, e.g. 'med medlemskort', 'kun nettbutikk'."
                ),
                url: urlInputSchema.describe(
                  "Link to the offer, plain absolute https URL."
                ),
                validFrom: calendarDateInputSchema
                  .nullable()
                  .optional()
                  .describe("First day of the offer (YYYY-MM-DD)."),
                validTo: calendarDateInputSchema
                  .nullable()
                  .optional()
                  .describe(
                    "Last day of the offer (YYYY-MM-DD). Leave out if the store gives none: the offer then shows for a week."
                  ),
              })
              .nullable()
              .describe("The best current offer, or null if none was found."),
          })
        )
        .min(1)
        .max(MAX_BATCH_SIZE),
    },
    outputSchema: {
      results: z.array(
        z.object({
          itemId: z.string(),
          name: z.string(),
          listId: z.string(),
          status: z
            .enum(["added", "updated", "cleared", "none"])
            .describe(
              "added = new offer, updated = replaced the previous offer, cleared = no offer found and the old one was removed, none = no offer found and none was stored."
            ),
        })
      ),
      skipped: z
        .array(
          z.object({
            itemId: z.string(),
            name: z.string(),
            reason: z.literal("EXPIRED"),
          })
        )
        .describe("Offers not saved because their last day has passed."),
    },
    annotations: UPDATE_ANNOTATIONS,
    resourceType: "shopping_item",
    handler: async (args, session) => {
      const { results, skipped } = await reportShoppingDeals(
        session.context,
        args.reports,
        now()
      )
      const found = results.filter(
        (entry) => entry.status === "added" || entry.status === "updated"
      ).length

      return {
        structuredContent: { results, skipped },
        summary:
          `Registrerte ${found} tilbud for ${results.length} sjekkede vare(r)` +
          (skipped.length > 0
            ? `; hoppet over ${skipped.length} utløpte.`
            : "."),
        resourceId: results.length === 1 ? (results[0]?.itemId ?? null) : null,
      }
    },
  })

  return [
    listShoppingDealsTool,
    listDealWatchItemsTool,
    setDealWatchTool,
    reportShoppingDealsTool,
  ]
}
