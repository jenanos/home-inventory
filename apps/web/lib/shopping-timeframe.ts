/**
 * When a shopping item is needed. Shared by the list page, the dashboard and
 * shared lists so the labels never drift apart. Mirrors the `Timeframe` enum.
 */
export const TIMEFRAMES = ["NOW", "SOON", "LATER", "SOMEDAY"] as const

export type ShoppingTimeframe = (typeof TIMEFRAMES)[number]

export const TIMEFRAME_LABELS: Record<ShoppingTimeframe, string> = {
  NOW: "Snarest",
  SOON: "Snart",
  LATER: "Kan vente",
  SOMEDAY: "Ingen hast",
}

export const TIMEFRAME_OPTIONS = TIMEFRAMES.map((value) => ({
  value,
  label: TIMEFRAME_LABELS[value],
}))

export function timeframeLabel(value: string | null | undefined) {
  return value && value in TIMEFRAME_LABELS
    ? TIMEFRAME_LABELS[value as ShoppingTimeframe]
    : null
}
