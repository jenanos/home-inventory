import { requireHousehold } from "@/lib/session"
import { getPlants } from "@/lib/queries/plant"
import { Flower2, Plus } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { PlantCard } from "./plant-card"
import { PlantFormDialog } from "./plant-form-dialog"

export default async function HagePage() {
  const { context } = await requireHousehold()
  const plants = await getPlants(context)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Hage
          </h1>
          <p className="text-sm text-muted-foreground">
            Oversikt over plantene i hagen og hvordan de skal stelles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PlantFormDialog
            trigger={
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Ny plante
              </Button>
            }
          />
        </div>
      </div>

      {plants.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <Flower2 className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="font-heading text-lg font-medium">
            Ingen planter ennå
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Legg til din første plante her, eller be en assistent koblet til via
            MCP om å legge inn hagen
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plants.map((plant) => (
            <PlantCard key={plant.id} plant={plant} />
          ))}
        </div>
      )}
    </div>
  )
}
