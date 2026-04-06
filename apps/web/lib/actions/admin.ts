"use server"

import { db } from "@workspace/db"
import { requireAdmin } from "@/lib/session"
import { revalidatePath } from "next/cache"

export async function getAdminData() {
  await requireAdmin()

  const [users, households] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        householdMembers: {
          include: { household: true },
        },
      },
    }),
    db.household.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        members: {
          include: { user: true },
        },
      },
    }),
  ])

  return { users, households }
}

export async function addUser(email: string) {
  await requireAdmin()

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    throw new Error("En bruker med denne e-posten finnes allerede.")
  }

  await db.user.create({ data: { email } })
  revalidatePath("/admin")
}

export async function deleteUser(userId: string) {
  const { session } = await requireAdmin()

  if (userId === session.user.id) {
    throw new Error("Du kan ikke slette din egen bruker.")
  }

  await db.user.delete({ where: { id: userId } })
  revalidatePath("/admin")
}

export async function deleteHousehold(householdId: string) {
  await requireAdmin()

  await db.household.delete({ where: { id: householdId } })
  revalidatePath("/admin")
}
