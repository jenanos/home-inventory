import Link from "next/link"
import { notFound } from "next/navigation"
import { BotMessageSquare } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { CategoryIcon } from "@/components/category-icon"
import { canManageShoppingListPrivacy } from "@/lib/shopping-list-access"
import { requireHousehold } from "@/lib/session"
import { getShoppingList } from "@/lib/queries/shopping-list"
import { ListHeader } from "./list-header"
import { ListFilters } from "./list-filters"
import { ItemList } from "./item-list"
import { AddItemSheet } from "./add-item-sheet"

interface ListPageProps {
  params: Promise<{ id: string }>
}

export default async function ListPage({ params }: ListPageProps) {
  const { id } = await params
  const { session, membership } = await requireHousehold()

  const list = await getShoppingList(
    id,
    membership.householdId,
    session.user.id
  )

  if (!list) {
    notFound()
  }

  const members = list.household.members.map((m) => ({
    id: m.user.id,
    name: m.user.name ?? m.user.email,
    email: m.user.email,
  }))

  const categories = list.household.categories.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
  }))

  const items = list.items.map((item) => {
    const alternatives = item.alternatives.map((alt) => ({
      id: alt.id,
      name: alt.name,
      price: alt.price ? Number(alt.price) : null,
      url: alt.url,
      imageUrl: alt.imageUrl,
      storeName: alt.storeName,
      notes: alt.notes,
      rank: alt.rank,
    }))

    // Preferred alternative (rank 0) takes precedence for price, url, store, image
    const topAlternative = alternatives[0] ?? null
    const effectivePrice =
      topAlternative?.price != null
        ? topAlternative.price
        : item.estimatedPrice
          ? Number(item.estimatedPrice)
          : null

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      priority: item.priority,
      phase: item.phase,
      dueDate: item.dueDate ? item.dueDate.toISOString() : null,
      estimatedPrice: item.estimatedPrice ? Number(item.estimatedPrice) : null,
      effectivePrice,
      url: item.url,
      imageUrl: item.imageUrl,
      storeName: item.storeName,
      status: item.status,
      purchasedAt: item.purchasedAt ? item.purchasedAt.toISOString() : null,
      category: item.category
        ? {
            id: item.category.id,
            name: item.category.name,
            icon: item.category.icon,
            color: item.category.color,
          }
        : null,
      assignedTo: item.assignedTo
        ? {
            id: item.assignedTo.id,
            name: item.assignedTo.name ?? item.assignedTo.email,
            email: item.assignedTo.email,
          }
        : null,
      alternatives,
      listId: item.listId,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }
  })

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
        canManagePrivacy={canManageShoppingListPrivacy(list, session.user.id)}
        shareLinks={list.shareLinks.map((sl) => ({
          id: sl.id,
          token: sl.token,
          isActive: sl.isActive,
        }))}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ListFilters categories={categories} members={members} />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/lists/${list.id}/llm-import`}>
              <BotMessageSquare className="h-4 w-4" data-icon="inline-start" />
              LLM-import
            </Link>
          </Button>
          <AddItemSheet
            listId={list.id}
            categories={categories}
            members={members}
          />
        </div>
      </div>

      <ItemList
        items={items}
        categories={categories}
        members={members}
        listId={list.id}
      />

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
