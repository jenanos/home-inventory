// Color presets for shopping list cards. Tuned to align with the rust/blue/
// petroleum/sage palette in packages/ui/src/styles/globals.css. Each color
// has a light + dark variant for the accent strip and a matching tint for
// the card background that stays subtle in both modes.

export type ListColorId =
  | "default"
  | "coral"
  | "amber"
  | "sage"
  | "petroleum"
  | "blue"
  | "violet"
  | "rose"

export interface ListColorPreset {
  id: ListColorId
  label: string
  /** Solid swatch shown in the picker. */
  swatch: string
  /** Visible accent (left strip on the card and progress fill). */
  accent: string
  /** Subtle background tint for the card. */
  tint: string
}

export const LIST_COLOR_PRESETS: ListColorPreset[] = [
  {
    id: "default",
    label: "Standard",
    swatch: "oklch(0.55 0.17 28)",
    accent: "oklch(0.55 0.17 28)",
    tint: "color-mix(in oklab, oklch(0.55 0.17 28) 8%, transparent)",
  },
  {
    id: "coral",
    label: "Korall",
    swatch: "oklch(0.65 0.16 35)",
    accent: "oklch(0.65 0.16 35)",
    tint: "color-mix(in oklab, oklch(0.65 0.16 35) 10%, transparent)",
  },
  {
    id: "amber",
    label: "Rav",
    swatch: "oklch(0.72 0.14 75)",
    accent: "oklch(0.72 0.14 75)",
    tint: "color-mix(in oklab, oklch(0.72 0.14 75) 12%, transparent)",
  },
  {
    id: "sage",
    label: "Salvie",
    swatch: "oklch(0.62 0.12 148)",
    accent: "oklch(0.62 0.12 148)",
    tint: "color-mix(in oklab, oklch(0.62 0.12 148) 10%, transparent)",
  },
  {
    id: "petroleum",
    label: "Petroleum",
    swatch: "oklch(0.55 0.10 200)",
    accent: "oklch(0.55 0.10 200)",
    tint: "color-mix(in oklab, oklch(0.55 0.10 200) 12%, transparent)",
  },
  {
    id: "blue",
    label: "Blå",
    swatch: "oklch(0.55 0.13 260)",
    accent: "oklch(0.55 0.13 260)",
    tint: "color-mix(in oklab, oklch(0.55 0.13 260) 12%, transparent)",
  },
  {
    id: "violet",
    label: "Fiolett",
    swatch: "oklch(0.58 0.14 305)",
    accent: "oklch(0.58 0.14 305)",
    tint: "color-mix(in oklab, oklch(0.58 0.14 305) 12%, transparent)",
  },
  {
    id: "rose",
    label: "Rose",
    swatch: "oklch(0.65 0.15 5)",
    accent: "oklch(0.65 0.15 5)",
    tint: "color-mix(in oklab, oklch(0.65 0.15 5) 10%, transparent)",
  },
]

const PRESETS_BY_ID = new Map(LIST_COLOR_PRESETS.map((p) => [p.id, p]))

export function isListColorId(value: unknown): value is ListColorId {
  return typeof value === "string" && PRESETS_BY_ID.has(value as ListColorId)
}

export function getListColorPreset(
  value: string | null | undefined
): ListColorPreset {
  if (value && PRESETS_BY_ID.has(value as ListColorId)) {
    return PRESETS_BY_ID.get(value as ListColorId)!
  }
  return PRESETS_BY_ID.get("default")!
}
