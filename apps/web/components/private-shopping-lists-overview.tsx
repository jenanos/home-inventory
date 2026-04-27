import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Lock, ArrowRight } from "lucide-react"

type ShoppingListSummaryItem = {
  id: string
  status: string
  estimatedPrice: { toNumber(): number } | null
  alternatives: { price: { toNumber(): number } | null }[]
}

type PrivateShoppingList = {
  id: string
  name: string
  items: ShoppingListSummaryItem[]
}

interface PrivateShoppingListsOverviewProps {
  lists: PrivateShoppingList[]
  title?: string
  description?: string
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

function getEffectivePrice(item: ShoppingListSummaryItem) {
  const altPrice = item.alternatives[0]?.price
  if (altPrice != null) return altPrice.toNumber()
  if (item.estimatedPrice != null) return item.estimatedPrice.toNumber()
  return 0
}

export function PrivateShoppingListsOverview({
  lists,
  title = "Private lister",
  description = "Bare synlig for deg og holdt utenfor husholdningsoversikten.",
}: PrivateShoppingListsOverviewProps) {
  if (lists.length === 0) return null

  const items = lists.flatMap((list) => list.items)
  const pendingCount = items.filter((item) => item.status === "PENDING").length
  const purchasedCount = items.filter(
    (item) => item.status === "PURCHASED"
  ).length
  const totalCost = items
    .filter((item) => item.status !== "SKIPPED")
    .reduce((sum, item) => sum + getEffectivePrice(item), 0)

  return (
    <Card className="shadow-sm">
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4" />
              {title}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <Badge variant="secondary">{lists.length} lister</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">Totalt</div>
            <div className="font-medium tabular-nums">
              {totalCost > 0 ? formatCurrency(totalCost) : "—"}
            </div>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">Gjenstår</div>
            <div className="font-medium">{pendingCount}</div>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <div className="text-xs text-muted-foreground">Kjøpt</div>
            <div className="font-medium">{purchasedCount}</div>
          </div>
        </div>

        <div className="space-y-2">
          {lists.map((list) => {
            const itemCount = list.items.length
            const purchased = list.items.filter(
              (item) => item.status === "PURCHASED"
            ).length
            const total = list.items
              .filter((item) => item.status !== "SKIPPED")
              .reduce((sum, item) => sum + getEffectivePrice(item), 0)
            const progress =
              itemCount > 0 ? Math.round((purchased / itemCount) * 100) : 0

            return (
              <Link
                key={list.id}
                href={`/lists/${list.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">
                      {list.name}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {purchased} av {itemCount} kjøpt
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <div className="text-sm font-medium tabular-nums">
                      {total > 0 ? formatCurrency(total) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {progress}%
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
