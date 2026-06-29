import { requireHousehold } from "@/lib/session"
import { getPlants } from "@/lib/queries/plant"
import { PlantLlmImportPageClient } from "../llm-import-page-client"

export default async function HageLlmImportPage() {
  const { membership } = await requireHousehold()
  const plants = await getPlants(membership.householdId)

  return (
    <PlantLlmImportPageClient
      householdName={membership.household.name}
      existingPlants={plants.map((plant) => ({
        name: plant.name,
        species: plant.species ?? undefined,
        location: plant.location ?? undefined,
        description: plant.description ?? undefined,
        careInstructions: plant.careInstructions ?? undefined,
        wateringNeed: plant.wateringNeed ?? undefined,
        wateringMethod: plant.wateringMethod ?? undefined,
        sunNeed: plant.sunNeed ?? undefined,
        pruningSeason: plant.pruningSeason ?? undefined,
        isToxic: plant.isToxic,
        toxicityNotes: plant.toxicityNotes ?? undefined,
        plantType: plant.plantType ?? undefined,
        soilType: plant.soilType ?? undefined,
        fertilizer: plant.fertilizer ?? undefined,
        hardinessZone: plant.hardinessZone ?? undefined,
        lifecycle: plant.lifecycle ?? undefined,
        bloomTime: plant.bloomTime ?? undefined,
        pests: plant.pests ?? undefined,
        notes: plant.notes ?? undefined,
        imageUrl: plant.imageUrl ?? undefined,
        sourceUrl: plant.sourceUrl ?? undefined,
      }))}
    />
  )
}
