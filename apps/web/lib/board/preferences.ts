import { cookies } from "next/headers"

import type { BoardGroupingOption } from "@/lib/board/types"
import {
  groupCookieName,
  parseGroup,
  parseView,
  viewCookieName,
  type BoardScope,
  type PageView,
} from "@/lib/board/view"

/**
 * The view and grouping a page opens with: the URL if it says, otherwise what
 * the user picked last time (cookie), otherwise the list.
 */
export async function resolveBoardPreferences<Id extends string>(options: {
  scope: BoardScope
  params: { visning?: string; grupper?: string }
  groupings: readonly BoardGroupingOption<Id>[]
  fallbackGrouping: Id
}): Promise<{ view: PageView; grouping: Id }> {
  const store = await cookies()
  const view = parseView(
    options.params.visning,
    store.get(viewCookieName(options.scope))?.value
  )
  const grouping = parseGroup(
    options.groupings,
    options.fallbackGrouping,
    options.params.grupper,
    store.get(groupCookieName(options.scope))?.value
  )
  return { view, grouping }
}
