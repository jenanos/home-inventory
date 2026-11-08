"use server"

import {
  createShoppingCategory,
  deleteShoppingCategory,
  updateShoppingCategory,
} from "@/lib/application/shopping/write"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

// Thin adapters over the category services shared with MCP. The household
// boundary is part of every write's `where`, so a category id from another
// household matches nothing.

export async function createCategory(
  name: string,
  icon?: string,
  color?: string
) {
  const { context } = await requireHousehold()
  const category = await createShoppingCategory(context, { name, icon, color })

  revalidatePath("/settings")
  return category
}

export async function updateCategory(
  categoryId: string,
  data: { name?: string; icon?: string; color?: string }
) {
  const { context } = await requireHousehold()
  await updateShoppingCategory(context, categoryId, data)

  revalidatePath("/settings")
}

export async function deleteCategory(categoryId: string) {
  const { context } = await requireHousehold()
  await deleteShoppingCategory(context, categoryId)

  revalidatePath("/settings")
}
