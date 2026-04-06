"use server"

import { db } from "@workspace/db"
import { DEFAULT_CATEGORIES } from "@workspace/db/seed-categories"
import { requireAuth } from "@/lib/session"
import { revalidatePath } from "next/cache"

export async function createHousehold(name: string) {
  const session = await requireAuth()

  const household = await db.household.create({
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
    where: {
      userId_householdId: {
        userId: invitedUser.id,
        householdId,
      },
    },
  })
  if (existingMembership) {
    throw new Error("Brukeren er allerede medlem av denne husstanden.")
  }

  await db.householdMember.create({
    data: {
      userId: invitedUser.id,
      householdId,
      role: "MEMBER",
    },
  })

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
