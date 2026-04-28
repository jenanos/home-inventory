import Link from "next/link"
import { requireHousehold } from "@/lib/session"
import { getShoppingLists } from "@/lib/queries/shopping-list"
import { PrivateShoppingListsOverview } from "@/components/private-shopping-lists-overview"
import { ShoppingStatsSummary } from "@/components/shopping-stats-summary"
import { getShoppingListItemEffectivePrice } from "@/lib/shopping-list-pricing"
import { ArrowRight, ListChecks, Lock } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { CreateListDialog } from "./create-list-dialog"
import { RenameListDialog } from "./rename-list-dialog"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

export default async function ListsPage() {
  const { session, membership } = await requireHousehold()
  const lists = await getShoppingLists(membership.householdId, session.user.id)
  const householdLists = lists.filter((list) => !list.isPrivate)
  const privateLists = lists.filter((list) => list.isPrivate)

  const allItems = householdLists.flatMap((l) => l.items)
  const totalEstimated = allItems.reduce(
    (sum, item) => sum + getShoppingListItemEffectivePrice(item),
    0
  )
  const purchasedItems = allItems.filter((i) => i.status === "PURCHASED")
  const purchasedTotal = purchasedItems.reduce(
    (sum, item) => sum + getShoppingListItemEffectivePrice(item),
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
          <p className="text-sm text-muted-foreground">
            Felles lister for husholdningen og dine egne private innkjøp
          </p>
        </div>
        <CreateListDialog />
      </div>

      {allItems.length > 0 && (
        <ShoppingStatsSummary
          totalEstimated={totalEstimated}
          purchasedTotal={purchasedTotal}
          totalCount={allItems.length}
          purchasedCount={purchasedCount}
          pendingCount={pendingCount}
        />
      )}

      {householdLists.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <ListChecks className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="font-heading text-lg font-medium">
            Ingen felles handlelister ennå
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Opprett en delt liste for å komme i gang med husholdningsinnkjøp
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {householdLists.map((list) => {
            const itemCount = list.items.length
            const listPurchasedCount = list.items.filter(
              (i) => i.status === "PURCHASED"
            ).length
            const listTotal = list.items.reduce(
              (sum, item) => sum + getShoppingListItemEffectivePrice(item),
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
                    <CardTitle className="truncate font-heading text-lg">
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

      {privateLists.length > 0 && (
        <PrivateShoppingListsOverview
          lists={privateLists}
          title="Dine private lister"
          description="Disse listene vises bare for deg og påvirker ikke husholdningens summer."
        />
      )}

      {lists.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            Private lister kan brukes til hobbyer og personlige innkjøp.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
