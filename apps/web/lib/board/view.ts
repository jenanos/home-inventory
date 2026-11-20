/**
 * List or board, and how the board is grouped. The choice is in the URL
 * (`?visning=tavle&grupper=frist`) so it can be linked, and in a cookie so the
 * page opens the way it was left.
 */

export type PageView = "liste" | "tavle"

export const VIEW_PARAM = "visning"
export const GROUP_PARAM = "grupper"

/** Each page remembers its own choice. */
export type BoardScope = "innkjop" | "handleliste" | "prosjekter"

export function viewCookieName(scope: BoardScope) {
  return `${scope}-visning`
}

export function groupCookieName(scope: BoardScope) {
  return `${scope}-grupper`
}

export function parseView(...values: Array<string | undefined>): PageView {
  for (const value of values) {
    if (value === "liste" || value === "tavle") return value
  }
  return "liste"
}

export function parseGroup<Id extends string>(
  allowed: readonly { id: Id }[],
  fallback: Id,
  ...values: Array<string | undefined>
): Id {
  for (const value of values) {
    const match = allowed.find((option) => option.id === value)
    if (match) return match.id
  }
  return fallback
}
