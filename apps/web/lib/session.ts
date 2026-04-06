import { auth } from "@/lib/auth"
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
  const membership = await db.householdMember.findFirst({
    where: { userId },
    include: {
      household: {
        include: {
          members: {
            include: { user: true },
          },
        },
      },
    },
  })
  return membership
}

export async function requireHousehold() {
  const session = await requireAuth()
  const membership = await getUserHousehold(session.user.id)

  if (!membership) {
    redirect("/onboarding")
  }

  return { session, membership }
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
