/** Icon names `CategoryIcon` can draw. Shared with the MCP category tool. */
export const CATEGORY_ICON_NAMES = [
  "baby",
  "sofa",
  "monitor",
  "chef-hat",
  "bath",
  "bed-double",
  "briefcase",
  "refrigerator",
  "house-plug",
  "lamp",
  "wrench",
  "flower-2",
  "sparkles",
  "shirt",
  "lightbulb",
  "archive",
  "box",
] as const

export type CategoryIconName = (typeof CATEGORY_ICON_NAMES)[number]
