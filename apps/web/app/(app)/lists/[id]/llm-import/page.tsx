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
    />
  )
}
