"use server"

import { db } from "@workspace/db"
import { requireAuth } from "@/lib/session"
import { revalidatePath } from "next/cache"

export async function updateProfile(name: string) {
  const session = await requireAuth()

  await db.user.update({
    where: { id: session.user.id },
    data: { name },
  })

  revalidatePath("/settings")
}
