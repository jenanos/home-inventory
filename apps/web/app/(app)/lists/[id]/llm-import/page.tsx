import { notFound } from "next/navigation"
import { requireHousehold } from "@/lib/session"
import { getShoppingList } from "@/lib/queries/shopping-list"
import { LlmImportPageClient } from "../llm-import-page-client"

interface ListLlmImportPageProps {
  params: Promise<{ id: string }>
}

export default async function ListLlmImportPage({
  params,
}: ListLlmImportPageProps) {
  const { id } = await params
  const { membership } = await requireHousehold()

  const list = await getShoppingList(id, membership.householdId)

  if (!list) {
    notFound()
  }

  const categories = list.household.categories.map((category) => ({
    id: category.id,
    name: category.name,
    icon: category.icon,
  }))

  return (
    <LlmImportPageClient
      listId={list.id}
      listName={list.name}
      categories={categories}
      existingItems={list.items.map((item) => ({
        name: item.name,
        description: item.description ?? undefined,
        categoryName: item.category?.name ?? undefined,
        priority: item.priority,
        phase: item.phase ?? undefined,
        estimatedPrice:
          item.estimatedPrice != null ? Number(item.estimatedPrice) : undefined,
        url: item.url ?? undefined,
        imageUrl: item.imageUrl ?? undefined,
        storeName: item.storeName ?? undefined,
        alternatives: item.alternatives.map((alternative) => ({
          name: alternative.name,
          price:
            alternative.price != null ? Number(alternative.price) : undefined,
          url: alternative.url ?? undefined,
          imageUrl: alternative.imageUrl ?? undefined,
          storeName: alternative.storeName ?? undefined,
          notes: alternative.notes ?? undefined,
        })),
      }))}
    />
  )
}
