"use server"

import { db } from "@workspace/db"
import {
  isUniqueConstraintError,
  notFound,
  optionalText,
  requiredText,
  validationError,
} from "@/lib/application/mutations"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

// The household boundary is part of every write's `where`, so a category id
// from another household matches nothing instead of being checked separately.

const CATEGORY = "kategori"

function duplicateName(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw validationError("En kategori med det navnet finnes allerede.")
  }
  throw error
}

export async function createCategory(
  name: string,
  icon?: string,
  color?: string
) {
  const { context } = await requireHousehold()

  const category = await db.category
    .create({
      data: {
        name: requiredText(name, "Navn"),
        icon: optionalText(icon, "Ikon", 50),
        color: optionalText(color, "Farge", 50),
        householdId: context.householdId,
      },
    })
    .catch(duplicateName)

  revalidatePath("/settings")
  return category
}

export async function updateCategory(
  categoryId: string,
  data: { name?: string; icon?: string; color?: string }
) {
  const { context } = await requireHousehold()

  const updated = await db.category
    .updateMany({
      where: { id: categoryId, householdId: context.householdId },
      data: {
        ...(data.name !== undefined && {
          name: requiredText(data.name, "Navn"),
        }),
        ...(data.icon !== undefined && {
          icon: optionalText(data.icon, "Ikon", 50),
        }),
        ...(data.color !== undefined && {
          color: optionalText(data.color, "Farge", 50),
        }),
      },
    })
    .catch(duplicateName)
  if (updated.count !== 1) throw notFound(CATEGORY)

  revalidatePath("/settings")
}

export async function deleteCategory(categoryId: string) {
  const { context } = await requireHousehold()

  const deleted = await db.category.deleteMany({
    where: { id: categoryId, householdId: context.householdId },
  })
  if (deleted.count !== 1) throw notFound(CATEGORY)

  revalidatePath("/settings")
}
