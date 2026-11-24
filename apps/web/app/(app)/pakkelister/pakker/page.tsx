import Link from "next/link"
import { ArrowLeft, Package, Plus } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import {
  listBundleTemplateUsage,
  listPackingBundles,
  listPackingPersons,
} from "@/lib/application/packing/read"
import { quantityByDurationOf } from "@/lib/application/packing/rules"
import {
  DURATION_SHORT_LABELS,
  DURATION_SLUGS,
  PACKING_DURATIONS,
  PACKING_SEASONS,
  SEASON_LABELS,
  SEASON_SLUGS,
  durationFromSlug,
  seasonFromSlug,
} from "@/lib/packing-labels"
import { requireHousehold } from "@/lib/session"
import { FilterChipRow } from "../filter-chips"
import { BundleCard } from "./bundle-card"
import { BundleFormDialog } from "./bundle-form-dialog"

interface PakkerPageProps {
  searchParams: Promise<{ sesong?: string; varighet?: string }>
}

export default async function PakkerPage({ searchParams }: PakkerPageProps) {
  const params = await searchParams
  const { context } = await requireHousehold()

  const season = seasonFromSlug(params.sesong)
  const duration = durationFromSlug(params.varighet)
  const isFiltered = season !== undefined || duration !== undefined

  const [bundles, allCount, persons, usage] = await Promise.all([
    listPackingBundles(context, { season, duration }),
    isFiltered
      ? listPackingBundles(context).then((all) => all.length)
      : Promise.resolve(null),
    listPackingPersons(context),
    listBundleTemplateUsage(context),
  ])
  const personOptions = persons.map(({ id, name }) => ({ id, name }))
  const totalCount = allCount ?? bundles.length

  const current = {
    sesong: season ? SEASON_SLUGS[season] : undefined,
    varighet: duration ? DURATION_SLUGS[duration] : undefined,
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 self-start" asChild>
          <Link href="/pakkelister">
            <ArrowLeft className="h-4 w-4" data-icon="inline-start" />
            Pakkelister
          </Link>
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              Pakker
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              En pakke er ting som pakkes sammen, f.eks. Treningstøy. Legg den
              til en pakkeliste, så kommer alt med – til riktig person og med
              antall som passer turens lengde.
            </p>
          </div>
          <BundleFormDialog
            persons={personOptions}
            trigger={
              <Button className="self-start sm:self-auto">
                <Plus className="mr-2 h-4 w-4" />
                Ny pakke
              </Button>
            }
          />
        </div>
      </div>

      {totalCount > 0 && (
        <div className="flex flex-col gap-2">
          <FilterChipRow
            label="Sesong"
            param="sesong"
            basePath="/pakkelister/pakker"
            params={current}
            current={current.sesong}
            options={[
              { value: undefined, label: "Alle" },
              ...PACKING_SEASONS.map((value) => ({
                value: SEASON_SLUGS[value],
                label: SEASON_LABELS[value],
              })),
            ]}
          />
          <FilterChipRow
            label="Varighet"
            param="varighet"
            basePath="/pakkelister/pakker"
            params={current}
            current={current.varighet}
            options={[
              { value: undefined, label: "Alle" },
              ...PACKING_DURATIONS.map((value) => ({
                value: DURATION_SLUGS[value],
                label: DURATION_SHORT_LABELS[value],
              })),
            ]}
          />
        </div>
      )}

      {totalCount === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <Package className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="font-heading text-lg font-medium">
            Ingen pakker ennå
          </h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Lag pakker som Treningstøy, Vintertøy barn eller Utenlandsreise
            (pass, reiseforsikring, adapter). Merk dem «legg til automatisk», så
            kommer de med på nye lister som passer.
          </p>
        </Card>
      ) : bundles.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Ingen pakker passer filteret.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bundles.map((bundle) => (
            <BundleCard
              key={bundle.id}
              persons={personOptions}
              bundle={{
                id: bundle.id,
                name: bundle.name,
                description: bundle.description,
                seasons: bundle.seasons,
                durations: bundle.durations,
                abroadOnly: bundle.abroadOnly,
                autoAdd: bundle.autoAdd,
                personId: bundle.personId,
                personName: bundle.person?.name ?? null,
                templates: usage.get(bundle.id) ?? [],
                items: bundle.items.map((item) => ({
                  id: item.id,
                  name: item.name,
                  quantity: item.quantity,
                  quantityByDuration: quantityByDurationOf(item),
                  notes: item.notes,
                })),
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
