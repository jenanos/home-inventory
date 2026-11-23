import { db } from "@workspace/db"

import {
  MAX_QUICK_NAV_PAGES,
  isQuickNavPageId,
  resolveQuickNavPages,
  type QuickNavPageId,
} from "../../quick-nav"
import type { ApplicationContext } from "../context"
import { validationError } from "../mutations"

/** The pages in the caller's bottom bar on phones. Personal, not household. */
export async function getQuickNavPages(
  context: ApplicationContext
): Promise<QuickNavPageId[]> {
  const user = await db.user.findUnique({
    where: { id: context.userId },
    select: { quickNavPages: true },
  })
  return resolveQuickNavPages(user?.quickNavPages)
}

/** Saves the bottom bar, in the given order. */
export async function setQuickNavPages(
  context: ApplicationContext,
  pages: string[]
): Promise<QuickNavPageId[]> {
  if (!Array.isArray(pages) || !pages.every(isQuickNavPageId)) {
    throw validationError("Ukjent side i hurtigpanelet.")
  }
  const unique = [...new Set(pages)]
  if (unique.length === 0) {
    throw validationError("Velg minst én side til hurtigpanelet.")
  }
  if (unique.length > MAX_QUICK_NAV_PAGES) {
    throw validationError(
      `Hurtigpanelet har plass til maks ${MAX_QUICK_NAV_PAGES} sider.`
    )
  }

  const user = await db.user.update({
    where: { id: context.userId },
    data: { quickNavPages: unique },
    select: { quickNavPages: true },
  })
  return resolveQuickNavPages(user.quickNavPages)
}
