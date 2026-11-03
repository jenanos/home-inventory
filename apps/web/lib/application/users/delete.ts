import { db } from "@workspace/db"

import { ApplicationError } from "../errors"

/**
 * Deletes a user account (plan 3.2).
 *
 * A private shopping list must always have an owner: the database enforces
 * `CHECK (NOT "isPrivate" OR "createdById" IS NOT NULL)`, which is invisible in
 * `schema.prisma`, while the foreign key is `ON DELETE SET NULL`. A bare
 * `user.delete` therefore fails for anyone who owns a private list.
 *
 * Decision: the user's private lists are deleted with the user. Nobody else can
 * see them, so transferring them to another member or making them public would
 * both expose data the user chose to keep private. Shared lists stay with the
 * household and simply lose their creator. Everything runs in one transaction,
 * so a failure leaves the account and its lists intact.
 *
 * OAuth requests, codes, grants and audit rows cascade from the user, so an
 * MCP client loses access in the same commit.
 */
export async function deleteUserAccount(userId: string) {
  return db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    })

    if (!target) {
      throw new ApplicationError(
        "NOT_FOUND",
        "Fant ingen bruker med den ID-en."
      )
    }
    if (target.isAdmin) {
      throw new ApplicationError("FORBIDDEN", "Admin-brukere kan ikke slettes.")
    }

    const privateLists = await tx.shoppingList.deleteMany({
      where: { createdById: userId, isPrivate: true },
    })

    // `isAdmin: false` in the delete itself, so a concurrent promotion between
    // the read above and this statement cannot be overridden.
    const deleted = await tx.user.deleteMany({
      where: { id: userId, isAdmin: false },
    })
    if (deleted.count !== 1) {
      throw new ApplicationError(
        "CONFLICT",
        "Brukeren ble endret under slettingen."
      )
    }

    return { deletedPrivateLists: privateLists.count }
  })
}
