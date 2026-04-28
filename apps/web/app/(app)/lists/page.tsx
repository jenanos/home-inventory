import { requireHousehold } from "@/lib/session"
import { getShoppingLists } from "@/lib/queries/shopping-list"
import { PrivateShoppingListsOverview } from "@/components/private-shopping-lists-overview"
import { ShoppingStatsSummary } from "@/components/shopping-stats-summary"
import { ShoppingListCard } from "@/components/shopping-list-card"
import { getShoppingListItemEffectivePrice } from "@/lib/shopping-list-pricing"
import { ListChecks, Lock } from "lucide-react"
import { Card, CardContent } from "@workspace/ui/components/card"
import { CreateListDialog } from "./create-list-dialog"
import { EditListDialog } from "./edit-list-dialog"

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
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {householdLists.map((list) => {
            const itemCount = list.items.length
            const listPurchasedCount = list.items.filter(
              (i) => i.status === "PURCHASED"
            ).length
            const listTotal = list.items.reduce(
              (sum, item) => sum + getShoppingListItemEffectivePrice(item),
              0
            )

            return (
              <ShoppingListCard
                key={list.id}
                href={`/lists/${list.id}`}
                name={list.name}
                color={list.color}
                itemCount={itemCount}
                purchasedCount={listPurchasedCount}
                totalCost={listTotal}
                editAction={
                  <EditListDialog
                    listId={list.id}
                    currentName={list.name}
                    currentColor={list.color}
                  />
                }
              />
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
