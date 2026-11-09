"use server"

import { db } from "@workspace/db"
import { requireAuth } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import {
  COLOR_PALETTE_COOKIE,
  COLOR_PALETTE_COOKIE_MAX_AGE,
  isColorPaletteId,
} from "@/lib/color-palettes"

export async function updateProfile(name: string) {
  const session = await requireAuth()

  await db.user.update({
    where: { id: session.user.id },
    data: { name },
  })

  revalidatePath("/settings")
}

/**
 * Remembers the chosen color palette on this device. Stored in a cookie (like
 * light/dark mode) so the root layout can render it without a flash.
 */
export async function setColorPalette(palette: string) {
  await requireAuth()

  if (!isColorPaletteId(palette)) {
    throw new Error("Ukjent fargepalett")
  }

  ;(await cookies()).set(COLOR_PALETTE_COOKIE, palette, {
    path: "/",
    maxAge: COLOR_PALETTE_COOKIE_MAX_AGE,
    sameSite: "lax",
  })

  revalidatePath("/", "layout")
}
