import { auth } from "@/lib/auth"
import {
  type ApplicationContext,
  getApplicationContext,
} from "@/lib/application/context"
import {
  HouseholdMembershipRequiredError,
  isApplicationError,
} from "@/lib/application/errors"
import { db } from "@workspace/db"
import { redirect } from "next/navigation"

export async function requireAuth() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }
  return { ...session, user: { ...session.user, id: session.user.id } }
}

export async function getUserHousehold(userId: string) {
  try {
    const context = await getApplicationContext(userId)
    return await getHouseholdMembership(context)
  } catch (error) {
    if (error instanceof HouseholdMembershipRequiredError) {
      return null
    }
    throw error
  }
}

async function getHouseholdMembership(context: ApplicationContext) {
  const membership = await db.householdMember.findUnique({
    where: {
      userId_householdId: {
        userId: context.userId,
        householdId: context.householdId,
      },
    },
    include: {
      household: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  if (!membership) {
    throw new HouseholdMembershipRequiredError()
  }

  return membership
}

export async function requireHousehold() {
  const session = await requireAuth()
  try {
    const context = await getApplicationContext(session.user.id)
    const membership = await getHouseholdMembership(context)
    return { session, membership, context }
  } catch (error) {
    if (error instanceof HouseholdMembershipRequiredError) {
      redirect("/onboarding")
    }
    throw error
  }
}

export async function isCurrentUserAdmin() {
  const session = await auth()
  if (!session?.user?.id) return false
  const user = await db.user.findUnique({ where: { id: session.user.id } })
  return user?.isAdmin === true
}

export async function requireAdmin() {
  const session = await requireAuth()
  const user = await db.user.findUnique({ where: { id: session.user.id } })

  if (!user?.isAdmin) {
    redirect("/")
  }

  return { session, user }
}

/**
 * For route handlers: the caller's household context, or null when the
 * request has no valid session or household. Unlike `requireHousehold` it
 * never redirects, so an API route can answer 401 instead of an HTML page.
 */
export async function getHouseholdContextOrNull(): Promise<ApplicationContext | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  try {
    return await getApplicationContext(session.user.id)
  } catch (error) {
    if (isApplicationError(error)) return null
    throw error
  }
}
