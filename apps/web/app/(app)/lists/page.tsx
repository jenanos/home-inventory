import Link from "next/link"
import { requireHousehold } from "@/lib/session"
import { getShoppingLists } from "@/lib/queries/shopping-list"
import {
  ShoppingCart,
  Wallet,
  Clock,
  CheckCircle2,
  ArrowRight,
  ListChecks,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Progress } from "@workspace/ui/components/progress"
import { CreateListDialog } from "./create-list-dialog"
import { RenameListDialog } from "./rename-list-dialog"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

function getEffectivePrice(item: {
  estimatedPrice: { toNumber(): number } | null
  alternatives: { price: { toNumber(): number } | null }[]
}) {
  const altPrice = item.alternatives[0]?.price
  if (altPrice != null) return altPrice.toNumber()
  if (item.estimatedPrice != null) return item.estimatedPrice.toNumber()
  return 0
}

export default async function ListsPage() {
  const { membership } = await requireHousehold()
  const lists = await getShoppingLists(membership.householdId)

  const allItems = lists.flatMap((l) => l.items)
  const totalEstimated = allItems.reduce(
    (sum, item) => sum + getEffectivePrice(item),
    0
  )
  const purchasedItems = allItems.filter((i) => i.status === "PURCHASED")
  const purchasedTotal = purchasedItems.reduce(
    (sum, item) => sum + getEffectivePrice(item),
    0
  )
  const pendingCount = allItems.filter((i) => i.status === "PENDING").length
  const purchasedCount = purchasedItems.length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Innkjøp
          </h1>
          <p className="text-muted-foreground text-sm">
            Oversikt over alle handlelister
          </p>
        </div>
        <CreateListDialog />
      </div>

      {allItems.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Totalt estimert
              </CardTitle>
              <Wallet className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tabular-nums sm:text-2xl">
                {totalEstimated > 0 ? formatCurrency(totalEstimated) : "—"}
              </div>
              <p className="text-muted-foreground text-xs">
                {allItems.length}{" "}
                {allItems.length === 1 ? "ting" : "ting"} totalt
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Kjøpt</CardTitle>
              <ShoppingCart className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tabular-nums sm:text-2xl">
                {formatCurrency(purchasedTotal)}
              </div>
              {totalEstimated > 0 && (
                <Progress
                  value={Math.round(
                    (purchasedTotal / totalEstimated) * 100
                  )}
                  className="mt-2"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Gjenstående
              </CardTitle>
              <Clock className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold sm:text-2xl">
                {pendingCount}
              </div>
              <p className="text-muted-foreground text-xs">ting igjen</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Kjøpt</CardTitle>
              <CheckCircle2 className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold sm:text-2xl">
                {purchasedCount}
              </div>
              {allItems.length > 0 && (
                <Progress
                  value={Math.round(
                    (purchasedCount / allItems.length) * 100
                  )}
                  className="mt-2"
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {lists.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <ListChecks className="text-muted-foreground mb-4 h-12 w-12" />
          <h3 className="font-heading text-lg font-medium">
            Ingen handlelister ennå
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Opprett din første liste for å komme i gang
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => {
            const itemCount = list.items.length
            const listPurchasedCount = list.items.filter(
              (i) => i.status === "PURCHASED"
            ).length
            const listTotal = list.items.reduce(
              (sum, item) => sum + getEffectivePrice(item),
              0
            )
            const progress =
              itemCount > 0
                ? Math.round((listPurchasedCount / itemCount) * 100)
                : 0

            return (
              <Card
                key={list.id}
                className="group relative transition-colors hover:bg-muted/50"
              >
                <Link
                  href={`/lists/${list.id}`}
                  className="absolute inset-0 z-0"
                >
                  <span className="sr-only">Åpne {list.name}</span>
                </Link>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="font-heading text-lg truncate">
                      {list.name}
                    </CardTitle>
                    <div className="relative z-10 flex items-center gap-1">
                      <RenameListDialog
                        listId={list.id}
                        currentName={list.name}
                      />
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-opacity sm:opacity-0 sm:group-hover:opacity-100" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {listPurchasedCount} av {itemCount} ting kjøpt
                    </span>
                    <Badge variant="secondary" className="tabular-nums">
                      {progress}%
                    </Badge>
                  </div>
                  {listTotal > 0 && (
                    <p className="mt-2 text-sm font-medium tabular-nums">
                      {formatCurrency(listTotal)}
                    </p>
                  )}
                  {itemCount > 0 && (
                    <div className="mt-3 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
