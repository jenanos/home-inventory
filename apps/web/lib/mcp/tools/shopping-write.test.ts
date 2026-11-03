import { describe, expect, it } from "vitest"

import { LIST_COLOR_PRESETS } from "../../list-colors"
import { LIST_COLORS } from "./shopping-write"

describe("shopping write contract", () => {
  it("lists exactly the color presets the app knows", () => {
    expect([...LIST_COLORS].sort()).toEqual(
      LIST_COLOR_PRESETS.map((preset) => preset.id).sort()
    )
  })
})
