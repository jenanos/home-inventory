import { requireHousehold } from "@/lib/session"
import {
  getCurrentDeals,
  getShoppingBoard,
  getShoppingLists,
} from "@/lib/queries/shopping-list"
import { ShoppingDealsPanel } from "@/components/shopping-deals-panel"
import { PrivateShoppingListsOverview } from "@/components/private-shopping-lists-overview"
import { ShoppingStatsPanel } from "@/components/shopping-stats-panel"
import { calculateShoppingStats } from "@/lib/dashboard-stats"
import { getHouseholdSettings } from "@/lib/application/households/read"
import { ShoppingListCard } from "@/components/shopping-list-card"
import { getShoppingListItemEffectivePrice } from "@/lib/shopping-list-pricing"
import { ListChecks, Lock } from "lucide-react"
import { Card, CardContent } from "@workspace/ui/components/card"
import { BoardToolbar } from "@/components/board/board-toolbar"
import {
  resolveBoardPreferences,
  resolveMobileShoppingView,
} from "@/lib/board/preferences"
import { SHOPPING_GROUPINGS } from "@/lib/board/shopping-board"
import { toShoppingItemData, toShoppingMembers } from "@/lib/shopping-item-view"
import { CreateListDialog } from "./create-list-dialog"
import { EditListDialog } from "./edit-list-dialog"
import { ShoppingBoard } from "./shopping-board"
import { AllItemsList } from "./all-items-list"
import { MobileViewToggle } from "./mobile-view-toggle"

interface ListsPageProps {
  searchParams: Promise<{ visning?: string; grupper?: string; mobil?: string }>
}

export default async function ListsPage({ searchParams }: ListsPageProps) {
  const { context } = await requireHousehold()
  const params = await searchParams
  const [{ view, grouping }, mobileView] = await Promise.all([
    resolveBoardPreferences({
      scope: "innkjop",
      params,
      groupings: SHOPPING_GROUPINGS,
      fallbackGrouping: "liste",
    }),
    resolveMobileShoppingView(params.mobil),
  ])
  const [lists, settings, currentDeals, board] = await Promise.all([
    getShoppingLists(context),
    getHouseholdSettings(context),
    getCurrentDeals(context),
    // The desktop board and the phone's list of all items read the same.
    view === "tavle" || mobileView === "alle"
      ? getShoppingBoard(context)
      : null,
  ])
  const householdLists = lists.filter((list) => !list.isPrivate)
  const privateLists = lists.filter((list) => list.isPrivate)

  const stats = calculateShoppingStats(
    householdLists.flatMap((list) => list.items),
    { moveInPeriodEndsOn: settings.moveInPeriodEndsOn }
  )

  const hasBoard = !!board && board.lists.length > 0
  const showBoard = hasBoard && view === "tavle"
  const showAllItems = hasBoard && mobileView === "alle"
  const boardItems = board
    ? board.lists.flatMap((list) => list.items.map(toShoppingItemData))
    : []
  const boardLists = board
    ? board.lists.map(({ id, name, color, isPrivate }) => ({
        id,
        name,
        color,
        isPrivate,
      }))
    : []

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
        <div className="flex items-center gap-2">
          {lists.length > 0 && (
            <BoardToolbar
              scope="innkjop"
              view={view}
              grouping={grouping}
              groupings={SHOPPING_GROUPINGS}
            />
          )}
          <CreateListDialog />
        </div>
      </div>

      <ShoppingDealsPanel
        deals={currentDeals.deals}
        today={currentDeals.today}
      />

      {stats.totalItems > 0 && <ShoppingStatsPanel stats={stats} />}

      {showBoard && board && (
        <div data-board className="hidden lg:block">
          <ShoppingBoard
            items={boardItems}
            lists={boardLists}
            categories={board.categories}
            members={toShoppingMembers(board.members)}
            grouping={grouping}
          />
        </div>
      )}

      {/* The board is desktop only; smaller screens keep the lists, or every
          item in one long list. */}
      <div
        className={
          showBoard ? "flex flex-col gap-4 lg:hidden" : "flex flex-col gap-4"
        }
      >
        {lists.length > 0 && <MobileViewToggle view={mobileView} />}

        {showAllItems && board && (
          <div className="flex flex-col gap-4 lg:hidden">
            <AllItemsList
              items={boardItems}
              lists={boardLists}
              categories={board.categories}
              members={toShoppingMembers(board.members)}
            />
          </div>
        )}

        <div
          className={
            showAllItems
              ? "hidden flex-col gap-6 lg:flex"
              : "flex flex-col gap-6"
          }
        >
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
        </div>
      </div>

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
