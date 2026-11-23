/*
 * Which pages the phone's bottom bar ("hurtigpanelet") shows. Pure data, safe
 * for client components and the application layer alike; the labels and icons
 * live in `app/(app)/nav-items.ts`.
 */

/** Every page that can sit in the bottom bar, in menu order. */
export const QUICK_NAV_PAGE_IDS = [
  "overview",
  "lists",
  "projects",
  "budget",
  "garden",
  "events",
  "packing",
  "settings",
] as const

export type QuickNavPageId = (typeof QUICK_NAV_PAGE_IDS)[number]

/** Room in the bar next to "Mer", which holds every page. */
export const MAX_QUICK_NAV_PAGES = 4

export const DEFAULT_QUICK_NAV_PAGES: readonly QuickNavPageId[] = [
  "overview",
  "lists",
  "projects",
  "events",
]

export function isQuickNavPageId(value: unknown): value is QuickNavPageId {
  return (
    typeof value === "string" &&
    (QUICK_NAV_PAGE_IDS as readonly string[]).includes(value)
  )
}

/**
 * The stored choice as the bar shows it: known ids only, no repeats, at most
 * `MAX_QUICK_NAV_PAGES`. Nothing stored, or nothing usable, gives the default.
 */
export function resolveQuickNavPages(
  stored: readonly string[] | null | undefined
): QuickNavPageId[] {
  const pages = [...new Set((stored ?? []).filter(isQuickNavPageId))].slice(
    0,
    MAX_QUICK_NAV_PAGES
  )
  return pages.length > 0 ? pages : [...DEFAULT_QUICK_NAV_PAGES]
}
