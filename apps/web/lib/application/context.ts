import { db, type Role } from "@workspace/db"

import {
  AmbiguousHouseholdMembershipError,
  ApplicationUserNotFoundError,
  HouseholdMembershipRequiredError,
} from "./errors"

export type ApplicationContext = {
  userId: string
  householdId: string
  role: Role
}

type ContextUser = {
  id: string
  householdMembers: Array<{
    householdId: string
    role: Role
  }>
}

export type ApplicationContextReader = (
  userId: string
) => Promise<ContextUser | null>

const readContextUser: ApplicationContextReader = (userId) =>
  db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      householdMembers: {
        select: {
          householdId: true,
          role: true,
        },
        take: 2,
      },
    },
  })

/**
 * Resolves the server-trusted authorization boundary for an application call.
 *
 * Fetching at most two memberships is intentional: one is accepted, while two
 * proves that legacy data is ambiguous and must fail closed.
 */
export async function getApplicationContext(
  userId: string,
  readUser: ApplicationContextReader = readContextUser
): Promise<ApplicationContext> {
  const user = await readUser(userId)

  if (!user) {
    throw new ApplicationUserNotFoundError()
  }

  if (user.householdMembers.length === 0) {
    throw new HouseholdMembershipRequiredError()
  }

  if (user.householdMembers.length !== 1) {
    throw new AmbiguousHouseholdMembershipError()
  }

  const membership = user.householdMembers[0]
  if (!membership) {
    throw new HouseholdMembershipRequiredError()
  }

  return {
    userId: user.id,
    householdId: membership.householdId,
    role: membership.role,
  }
}
