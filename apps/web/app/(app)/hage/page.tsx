import { requireHousehold } from "@/lib/session"
import { getGardenBeds, getPlants } from "@/lib/queries/plant"
import { Flower2, Plus, Shovel } from "lucide-react"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { PlantCard } from "./plant-card"
import { PlantFormDialog } from "./plant-form-dialog"

/** `?bed=<id>` shows one bed, `?bed=uten` the plants without a bed. */
const WITHOUT_BED = "uten"

interface HagePageProps {
  searchParams: Promise<{ bed?: string }>
}

export default async function HagePage({ searchParams }: HagePageProps) {
  const params = await searchParams
  const { context } = await requireHousehold()
  const [plants, beds] = await Promise.all([
    getPlants(context),
    getGardenBeds(context),
  ])

  const bedOptions = beds.map((bed) => ({ id: bed.id, name: bed.name }))
  const selectedBed = beds.find((bed) => bed.id === params.bed)
  const withoutBed = params.bed === WITHOUT_BED
  const plantsWithoutBed = plants.filter(
    (plant) => plant.placements.length === 0
  )

  const visible = selectedBed
    ? plants.filter((plant) =>
        plant.placements.some((placement) => placement.bedId === selectedBed.id)
      )
    : withoutBed
      ? plantsWithoutBed
      : plants

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
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/hage/bed">
              <Shovel className="h-4 w-4" data-icon="inline-start" />
              Bed
            </Link>
          </Button>
          <PlantFormDialog
            beds={bedOptions}
            defaultBedId={selectedBed?.id}
            trigger={
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Ny plante
              </Button>
            }
          />
        </div>
      </div>

      {beds.length > 0 && plants.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="w-10 shrink-0 text-xs text-muted-foreground">
            Bed
          </span>
          <div className="flex gap-1.5">
            <FilterChip href="/hage" active={!selectedBed && !withoutBed}>
              Alle ({plants.length})
            </FilterChip>
            {beds.map((bed) => (
              <FilterChip
                key={bed.id}
                href={`/hage?bed=${bed.id}`}
                active={selectedBed?.id === bed.id}
              >
                {bed.name} ({bed.placements.length})
              </FilterChip>
            ))}
            {plantsWithoutBed.length > 0 && (
              <FilterChip href={`/hage?bed=${WITHOUT_BED}`} active={withoutBed}>
                Uten bed ({plantsWithoutBed.length})
              </FilterChip>
            )}
          </div>
        </div>
      )}

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
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Ingen planter i dette bedet ennå.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((plant) => (
            <PlantCard key={plant.id} plant={plant} beds={bedOptions} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </Link>
  )
}
