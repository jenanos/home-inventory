import { type Prisma } from "@workspace/db"

type AccessibleShoppingList = {
  householdId: string
  isPrivate: boolean
  createdById: string | null
}

export function getVisibleShoppingListsWhere(
  householdId: string,
  userId: string
): Prisma.ShoppingListWhereInput {
  return {
    householdId,
    OR: [{ isPrivate: false }, { createdById: userId }],
  }
}

export function isShoppingListAccessible(
  list: AccessibleShoppingList | null | undefined,
  householdId: string,
  userId: string
) {
  return Boolean(
    list &&
    list.householdId === householdId &&
    (!list.isPrivate || list.createdById === userId)
  )
}

export function canManageShoppingListPrivacy(
  list: Pick<AccessibleShoppingList, "createdById">,
  userId: string
) {
  return list.createdById === null || list.createdById === userId
}
