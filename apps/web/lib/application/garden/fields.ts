/*
 * The plant fields that are worth filling in: what they are called and which
 * plants they apply to.
 *
 * MCP reports the empty ones as `missingFields` on every plant, so an
 * assistant knows what to look up or ask about instead of guessing. Free text
 * such as notes, pests and links is never a gap, and neither are the dates the
 * household records itself. Pure data, safe for client components.
 */

type Row = Record<string, unknown>

export type PlantOptionalField = {
  key: string
  label: string
  /** Plants the field makes sense for. Defaults to every plant. */
  appliesTo?: (plant: Row) => boolean
}

/** Woody and lasting plants are pruned; annuals and vegetables are not. */
const PRUNED_TYPES = new Set(["TREE", "SHRUB", "PERENNIAL", "CLIMBER"])

export const PLANT_OPTIONAL_FIELDS: PlantOptionalField[] = [
  { key: "species", label: "Art" },
  { key: "plantType", label: "Plantetype" },
  { key: "lifecycle", label: "Livssyklus" },
  { key: "location", label: "Plassering" },
  { key: "sunNeed", label: "Solbehov" },
  { key: "wateringNeed", label: "Vannbehov" },
  { key: "careInstructions", label: "Stellinstruksjoner" },
  { key: "soilType", label: "Jordtype" },
  { key: "hardinessZone", label: "Herdighetssone" },
  {
    key: "bloomTime",
    label: "Blomstringstid",
    appliesTo: (plant) => plant.plantType !== "VEGETABLE",
  },
  {
    key: "pruningSeason",
    label: "Beskjæringstid",
    appliesTo: (plant) =>
      typeof plant.plantType === "string" && PRUNED_TYPES.has(plant.plantType),
  },
]

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === ""
}

/** Applicable fields without a value, in definition order. */
export function missingPlantFields(plant: object): string[] {
  const row = plant as Row
  return PLANT_OPTIONAL_FIELDS.filter(
    (field) => (field.appliesTo?.(row) ?? true) && isEmpty(row[field.key])
  ).map((field) => field.key)
}
