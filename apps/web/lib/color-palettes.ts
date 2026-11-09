// Color palettes the user can pick between on the settings page. The colors
// themselves live as CSS variables in packages/ui/src/styles/globals.css,
// keyed by `data-palette` on <html>. This module only knows the ids, labels
// and the cookie that remembers the choice per device (like light/dark mode).

export const COLOR_PALETTE_IDS = [
  "terrakotta",
  "skog",
  "fjord",
  "lyng",
] as const

export type ColorPaletteId = (typeof COLOR_PALETTE_IDS)[number]

export const DEFAULT_COLOR_PALETTE: ColorPaletteId = "terrakotta"

export const COLOR_PALETTE_COOKIE = "color-palette"

/** One year, in seconds. */
export const COLOR_PALETTE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export interface ColorPalette {
  id: ColorPaletteId
  label: string
  description: string
  /** Browser UI color (PWA status bar) per mode, matching `--background`. */
  themeColor: { light: string; dark: string }
}

export const COLOR_PALETTES: readonly ColorPalette[] = [
  {
    id: "terrakotta",
    label: "Terrakotta",
    description: "Rustrød med dypblå og petrol. Den opprinnelige paletten.",
    themeColor: { light: "#fbfaf7", dark: "#1a1c25" },
  },
  {
    id: "skog",
    label: "Skog",
    description: "Granskog-grønn med varm oker og lyse lintoner.",
    themeColor: { light: "#f8f9f5", dark: "#0c140f" },
  },
  {
    id: "fjord",
    label: "Fjord",
    description: "Kjølig fjordblå med sand og skifergrått.",
    themeColor: { light: "#f8fafc", dark: "#091018" },
  },
  {
    id: "lyng",
    label: "Lyng",
    description: "Dempet lyng-lilla med salvie og varm stein.",
    themeColor: { light: "#fbf8fa", dark: "#150f16" },
  },
]

export function isColorPaletteId(value: unknown): value is ColorPaletteId {
  return (
    typeof value === "string" &&
    (COLOR_PALETTE_IDS as readonly string[]).includes(value)
  )
}

/** Unknown or missing values fall back to the default palette. */
export function parseColorPalette(value: string | undefined | null) {
  return isColorPaletteId(value) ? value : DEFAULT_COLOR_PALETTE
}

export function getColorPalette(id: ColorPaletteId): ColorPalette {
  return (
    COLOR_PALETTES.find((palette) => palette.id === id) ?? COLOR_PALETTES[0]!
  )
}
