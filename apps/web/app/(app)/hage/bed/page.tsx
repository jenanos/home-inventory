import Link from "next/link"
import { ArrowLeft, Plus, Shovel } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { getGardenBeds } from "@/lib/queries/plant"
import { requireHousehold } from "@/lib/session"
import { BedCard } from "./bed-card"
import { BedFormDialog } from "./bed-form-dialog"

export default async function GardenBedsPage() {
  const { context } = await requireHousehold()
  const beds = await getGardenBeds(context)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/hage">
            <ArrowLeft className="h-4 w-4" data-icon="inline-start" />
            Hage
          </Link>
        </Button>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Bed
          </h1>
          <p className="text-sm text-muted-foreground">
            Bedene og områdene i hagen. En plante kan stå i flere bed.
          </p>
        </div>
        <BedFormDialog
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nytt bed
            </Button>
          }
        />
      </div>

      {beds.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <Shovel className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="font-heading text-lg font-medium">Ingen bed ennå</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Opprett bedene i hagen, så kan du plassere plantene i dem
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {beds.map((bed) => (
            <BedCard key={bed.id} bed={bed} />
          ))}
        </div>
      )}
    </div>
  )
}
