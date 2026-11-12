"use server"

import { db } from "@workspace/db"
import { DEFAULT_CATEGORIES } from "@workspace/db/seed-categories"
import { updateMoveInPeriod as updateMoveInPeriodService } from "@/lib/application/households/write"
import { requireAuth, requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  )
}

export async function createHousehold(name: string) {
  const session = await requireAuth()

  const existingMembership = await db.householdMember.findUnique({
    where: { userId: session.user.id },
    select: { userId: true },
  })
  if (existingMembership) {
    throw new Error("Brukeren er allerede medlem av en husstand.")
  }

  let household
  try {
    household = await db.household.create({
      data: {
        name,
        members: {
          create: {
            userId: session.user.id,
            role: "OWNER",
          },
        },
        categories: {
          createMany: {
            data: DEFAULT_CATEGORIES.map((cat) => ({
              name: cat.name,
              icon: cat.icon,
              color: cat.color,
              isDefault: true,
            })),
          },
        },
      },
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("Brukeren er allerede medlem av en husstand.")
    }
    throw error
  }

  revalidatePath("/")
  return household
}

export async function inviteToHousehold(householdId: string, email: string) {
  const session = await requireAuth()

  const membership = await db.householdMember.findUnique({
    where: {
      userId_householdId: {
        userId: session.user.id,
        householdId,
      },
    },
  })

  if (!membership || membership.role !== "OWNER") {
    throw new Error("Only owners can invite members")
  }

  let invitedUser = await db.user.findUnique({ where: { email } })
  if (!invitedUser) {
    invitedUser = await db.user.create({ data: { email } })
  }

  const existingMembership = await db.householdMember.findUnique({
    where: { userId: invitedUser.id },
  })
  if (existingMembership) {
    if (existingMembership.householdId === householdId) {
      throw new Error("Brukeren er allerede medlem av denne husstanden.")
    }
    throw new Error("Brukeren er allerede medlem av en annen husstand.")
  }

  try {
    await db.householdMember.create({
      data: {
        userId: invitedUser.id,
        householdId,
        role: "MEMBER",
      },
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("Brukeren er allerede medlem av en husstand.")
    }
    throw error
  }

  revalidatePath("/settings")
}

export async function removeMember(householdId: string, userId: string) {
  const session = await requireAuth()

  const membership = await db.householdMember.findUnique({
    where: {
      userId_householdId: {
        userId: session.user.id,
        householdId,
      },
    },
  })

  if (!membership || membership.role !== "OWNER") {
    throw new Error("Only owners can remove members")
  }

  if (userId === session.user.id) {
    throw new Error("Cannot remove yourself")
  }

  await db.householdMember.delete({
    where: {
      userId_householdId: { userId, householdId },
    },
  })

  revalidatePath("/settings")
}

/**
 * Sets the last day of the move-in period as `YYYY-MM-DD`, or clears it with
 * `null`. The shopping numbers on the dashboard and lists depend on it.
 */
export async function updateMoveInPeriod(value: string | null) {
  const { context } = await requireHousehold()
  const settings = await updateMoveInPeriodService(context, {
    moveInPeriodEndsOn: value,
  })

  revalidatePath("/")
  revalidatePath("/lists")
  revalidatePath("/settings")
  return settings
}
