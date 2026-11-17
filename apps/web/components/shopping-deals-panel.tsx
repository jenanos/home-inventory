import Link from "next/link"
import { ExternalLink, Lock, Tag } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import {
  dealSavingsPercent,
  describeDealPeriod,
  formatDealPrice,
  isAtOrBelowTarget,
  type DealView,
} from "@/lib/shopping-deals"
import { RemoveDealButton } from "./remove-deal-button"

/**
 * "Tilbud nå": items on the shopping lists that a store has on offer right
 * now, reported by an assistant's deal check. Kept apart from the lists so it
 * is obvious what to act on, each with where, for how much and until when.
 * Renders nothing when there are no current offers.
 */
export function ShoppingDealsPanel({
  deals,
  today,
  showList = true,
  className,
}: {
  deals: DealView[]
  /** `YYYY-MM-DD` in Norway. */
  today: string
  /** Name the list each item is on; off on a list's own page. */
  showList?: boolean
  className?: string
}) {
  if (deals.length === 0) return null

  return (
    <section
      aria-labelledby="shopping-deals-heading"
      className={cn(
        "rounded-xl border border-amber-300/70 bg-amber-50/70 p-3 sm:p-4 dark:border-amber-500/30 dark:bg-amber-950/20",
        className
      )}
    >
      <h2
        id="shopping-deals-heading"
        className="mb-3 flex items-center gap-1.5 font-heading text-base font-medium text-amber-950 dark:text-amber-100"
      >
        <Tag className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        Tilbud nå
        <span className="text-sm font-normal text-amber-800/80 dark:text-amber-200/70">
          ({deals.length})
        </span>
      </h2>

      <ul className="grid gap-2 lg:grid-cols-2">
        {deals.map((deal) => (
          <DealRow
            key={deal.itemId}
            deal={deal}
            today={today}
            showList={showList}
          />
        ))}
      </ul>
    </section>
  )
}

function DealRow({
  deal,
  today,
  showList,
}: {
  deal: DealView
  today: string
  showList: boolean
}) {
  const savings = dealSavingsPercent(deal)
  const period = describeDealPeriod(deal, today)
  const belowTarget = isAtOrBelowTarget(deal, deal.targetPrice)
  const details = [deal.productName, deal.priceNote].filter(Boolean)

  return (
    <li className="flex min-w-0 items-start gap-3 rounded-lg border border-amber-200 bg-card p-3 dark:border-amber-500/20">
      {deal.imageUrl && (
        <img
          src={deal.imageUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-md object-cover"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/lists/${deal.listId}`}
            className="min-w-0 truncate font-medium hover:underline"
          >
            {deal.itemName}
          </Link>
          <RemoveDealButton itemId={deal.itemId} itemName={deal.itemName} />
        </div>

        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span className="font-semibold text-amber-800 tabular-nums dark:text-amber-300">
            {formatDealPrice(deal.price)}
          </span>
          {deal.regularPrice != null && deal.regularPrice > deal.price && (
            <span className="text-xs text-muted-foreground tabular-nums line-through">
              {formatDealPrice(deal.regularPrice)}
            </span>
          )}
          <span className="font-medium">{deal.store}</span>
          {period && (
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {period}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {savings != null && savings > 0 && (
            <Badge className="h-5 bg-amber-200 px-1.5 text-xs text-amber-950 dark:bg-amber-500/25 dark:text-amber-100">
              −{savings} %
            </Badge>
          )}
          {belowTarget && (
            <Badge
              variant="outline"
              className="h-5 border-emerald-300 px-1.5 text-xs text-emerald-800 dark:border-emerald-500/40 dark:text-emerald-300"
            >
              Under målpris
            </Badge>
          )}
          {showList && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {deal.isPrivate && <Lock className="h-3 w-3" />}
              {deal.listName}
            </span>
          )}
          {deal.url && (
            <a
              href={deal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Til tilbudet
            </a>
          )}
        </div>

        {details.length > 0 && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {details.join(" · ")}
          </p>
        )}
      </div>
    </li>
  )
}
