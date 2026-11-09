import { describe, expect, it } from "vitest"

import { missingPlantFields } from "./fields"

describe("missingPlantFields", () => {
  it("reports every applicable empty field and never free text", () => {
    expect(
      missingPlantFields({ name: "Ukjent", notes: null, pests: "" })
    ).toEqual([
      "species",
      "plantType",
      "lifecycle",
      "location",
      "sunNeed",
      "wateringNeed",
      "careInstructions",
      "soilType",
      "hardinessZone",
      "bloomTime",
    ])
  })

  it("asks for a pruning season only for plants that are pruned", () => {
    expect(missingPlantFields({ plantType: "SHRUB" })).toContain(
      "pruningSeason"
    )
    expect(missingPlantFields({ plantType: "ANNUAL" })).not.toContain(
      "pruningSeason"
    )
  })

  it("does not ask when a vegetable blooms", () => {
    expect(missingPlantFields({ plantType: "VEGETABLE" })).not.toContain(
      "bloomTime"
    )
  })

  it("treats filled values as present", () => {
    expect(
      missingPlantFields({
        species: "Lavandula angustifolia",
        plantType: "PERENNIAL",
        lifecycle: "PERENNIAL",
        location: "Sørvegg",
        sunNeed: "FULL_SUN",
        wateringNeed: "LOW",
        careInstructions: "Beskjær etter blomstring",
        soilType: "Veldrenert",
        hardinessZone: "H5",
        bloomTime: "Juni–august",
        pruningSeason: "August",
      })
    ).toEqual([])
  })
})
