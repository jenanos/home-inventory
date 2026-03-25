"use server"

import { db } from "@workspace/db"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

export async function createCategory(
  name: string,
  icon?: string,
  color?: string
) {
  const { membership } = await requireHousehold()

  const category = await db.category.create({
    data: {
      name,
      icon,
      color,
      householdId: membership.householdId,
    },
  })

  revalidatePath("/settings")
  return category
}

export async function updateCategory(
  categoryId: string,
  data: { name?: string; icon?: string; color?: string }
) {
  const { membership } = await requireHousehold()

  const category = await db.category.findUnique({
    where: { id: categoryId },
  })
  if (!category || category.householdId !== membership.householdId) {
    throw new Error("Category not found")
  }

  await db.category.update({
    where: { id: categoryId },
    data,
  })

  revalidatePath("/settings")
}

export async function deleteCategory(categoryId: string) {
  const { membership } = await requireHousehold()

  const category = await db.category.findUnique({
    where: { id: categoryId },
  })
  if (!category || category.householdId !== membership.householdId) {
    throw new Error("Category not found")
  }

  await db.category.delete({ where: { id: categoryId } })

  revalidatePath("/settings")
}
