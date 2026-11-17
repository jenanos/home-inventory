/**
 * Plain view data and labels for store offers on shopping items, shared by
 * the server pages and the client components. Dates are `YYYY-MM-DD` in
 * Norway; prices are NOK numbers.
 */

export type DealSummary = {
  store: string
  productName: string | null
  price: number
  regularPrice: number | null
  priceNote: string | null
  url: string | null
  validFrom: string | null
  validTo: string | null
}

export type DealView = DealSummary & {
  itemId: string
  itemName: string
  listId: string
  listName: string
  isPrivate: boolean
  imageUrl: string | null
  /** The price the household hoped for, if set. */
  targetPrice: number | null
  /** What the household planned to pay; null when unknown. */
  plannedPrice: number | null
}

type DecimalLike = { toNumber(): number }

type DealRow = {
  store: string
  productName: string | null
  price: DecimalLike
  regularPrice: DecimalLike | null
  priceNote: string | null
  url: string | null
  validFrom: Date | null
  validTo: Date | null
}

const dateOnly = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : null

export function toDealSummary(deal: DealRow): DealSummary {
  return {
    store: deal.store,
    productName: deal.productName,
    price: deal.price.toNumber(),
    regularPrice: deal.regularPrice ? deal.regularPrice.toNumber() : null,
    priceNote: deal.priceNote,
    url: deal.url,
    validFrom: dateOnly(deal.validFrom),
    validTo: dateOnly(deal.validTo),
  }
}

/** How far below the regular price, in whole percent; null if unknown. */
export function dealSavingsPercent(
  deal: Pick<DealSummary, "price" | "regularPrice">
) {
  if (deal.regularPrice == null || deal.regularPrice <= 0) return null
  const saved = (deal.regularPrice - deal.price) / deal.regularPrice
  return saved > 0 ? Math.floor(saved * 100) : null
}

export function isAtOrBelowTarget(
  deal: Pick<DealSummary, "price">,
  targetPrice: number | null
) {
  return targetPrice != null && deal.price <= targetPrice
}

const dayFormatter = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
})

const formatDay = (dateOnly: string) =>
  dayFormatter.format(new Date(`${dateOnly}T00:00:00.000Z`))

/** "t.o.m. 24. nov.", "siste dag i dag", "fra 20. nov." … */
export function describeDealPeriod(
  deal: Pick<DealSummary, "validFrom" | "validTo">,
  today: string
) {
  if (deal.validFrom && deal.validFrom > today) {
    return deal.validTo
      ? `${formatDay(deal.validFrom)} – ${formatDay(deal.validTo)}`
      : `fra ${formatDay(deal.validFrom)}`
  }
  if (!deal.validTo) return null
  if (deal.validTo === today) return "siste dag i dag"
  return `t.o.m. ${formatDay(deal.validTo)}`
}

export const formatDealPrice = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
