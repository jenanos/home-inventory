import { notFound } from "next/navigation"
import { CategoryIcon } from "@/components/category-icon"
import { canManageShoppingListPrivacy } from "@/lib/shopping-list-access"
import { requireHousehold } from "@/lib/session"
import { getCurrentDeals, getShoppingList } from "@/lib/queries/shopping-list"
import { ShoppingDealsPanel } from "@/components/shopping-deals-panel"
import {
  toShoppingItemData,
  toShoppingMembers,
  type ShoppingCategoryOption,
} from "@/lib/shopping-item-view"
import { BoardToolbar } from "@/components/board/board-toolbar"
import { resolveBoardPreferences } from "@/lib/board/preferences"
import { SHOPPING_GROUPINGS } from "@/lib/board/shopping-board"
import { ShoppingBoard } from "../shopping-board"
import { ListHeader } from "./list-header"
import { ListFilters } from "./list-filters"
import { ItemList } from "./item-list"
import { AddItemSheet } from "./add-item-sheet"

interface ListPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ visning?: string; grupper?: string }>
}

/** A single list's board has no "Liste" column to move between. */
const LIST_PAGE_GROUPINGS = SHOPPING_GROUPINGS.filter(
  (option) => option.id !== "liste"
)

export default async function ListPage({
  params,
  searchParams,
}: ListPageProps) {
  const { id } = await params
  const { context } = await requireHousehold()
  const { view, grouping } = await resolveBoardPreferences({
    scope: "handleliste",
    params: await searchParams,
    groupings: LIST_PAGE_GROUPINGS,
    fallbackGrouping: "prioritet",
  })

  const [list, currentDeals] = await Promise.all([
    getShoppingList(context, id),
    getCurrentDeals(context, { listId: id }),
  ])

  if (!list) {
    notFound()
  }

  const members = toShoppingMembers(list.household.members)
  const categories: ShoppingCategoryOption[] = list.household.categories
  const items = list.items.map(toShoppingItemData)

  const totalSum = items.reduce(
    (sum, item) =>
      item.status !== "SKIPPED" && item.effectivePrice
        ? sum + item.effectivePrice
        : sum,
    0
  )

  const purchasedSum = items.reduce(
    (sum, item) =>
      item.status === "PURCHASED" && item.effectivePrice
        ? sum + item.effectivePrice
        : sum,
    0
  )

  const categoryTotals = items
    .filter((item) => item.status !== "SKIPPED")
    .reduce(
      (acc, item) => {
        const catName = item.category?.name ?? "Uten kategori"
        const catColor = item.category?.color ?? null
        const catIcon = item.category?.icon ?? null
        if (!acc[catName]) {
          acc[catName] = { total: 0, count: 0, color: catColor, icon: catIcon }
        }
        acc[catName].total += item.effectivePrice ?? 0
        acc[catName].count += 1
        return acc
      },
      {} as Record<
        string,
        {
          total: number
          count: number
          color: string | null
          icon: string | null
        }
      >
    )

  return (
    <div className="flex flex-col gap-6">
      <ListHeader
        listId={list.id}
        listName={list.name}
        totalSum={totalSum}
        purchasedSum={purchasedSum}
        itemCount={items.length}
        purchasedCount={items.filter((i) => i.status === "PURCHASED").length}
        isPrivate={list.isPrivate}
        project={list.project}
        canManagePrivacy={canManageShoppingListPrivacy(list, context.userId)}
        shareLinks={list.shareLinks.map((sl) => ({
          id: sl.id,
          token: sl.token,
          isActive: sl.isActive,
        }))}
      />

      <ShoppingDealsPanel
        deals={currentDeals.deals}
        today={currentDeals.today}
        showList={false}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ListFilters categories={categories} members={members} />
        <div className="flex items-center gap-2">
          <BoardToolbar
            scope="handleliste"
            view={view}
            grouping={grouping}
            groupings={LIST_PAGE_GROUPINGS}
          />
          <AddItemSheet
            listId={list.id}
            categories={categories}
            members={members}
          />
        </div>
      </div>

      {view === "tavle" && items.length > 0 ? (
        <>
          <div data-board className="hidden lg:block">
            <ShoppingBoard
              items={items}
              lists={[
                {
                  id: list.id,
                  name: list.name,
                  color: list.color,
                  isPrivate: list.isPrivate,
                },
              ]}
              categories={categories}
              members={members}
              grouping={grouping}
              applyListFilters
            />
          </div>
          {/* The board is desktop only. */}
          <div className="lg:hidden">
            <ItemList
              items={items}
              categories={categories}
              members={members}
              listId={list.id}
            />
          </div>
        </>
      ) : (
        <ItemList
          items={items}
          categories={categories}
          members={members}
          listId={list.id}
        />
      )}

      {Object.keys(categoryTotals).length > 0 && (
        <div className="rounded-xl border bg-card p-4 shadow-xs ring-1 ring-foreground/10">
          <h3 className="mb-3 font-heading text-base font-medium">
            Oppsummering per kategori
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(categoryTotals)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([name, data]) => (
                <div
                  key={name}
                  className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {data.icon && (
                      <CategoryIcon
                        name={data.icon}
                        className="h-4 w-4 shrink-0"
                      />
                    )}
                    <span className="truncate text-sm font-medium">{name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      ({data.count})
                    </span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {data.total > 0
                      ? new Intl.NumberFormat("nb-NO", {
                          style: "currency",
                          currency: "NOK",
                          maximumFractionDigits: 0,
                        }).format(data.total)
                      : "—"}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
