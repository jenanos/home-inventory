import Link from "next/link"
import { CalendarDays, Luggage, Package } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { requireHousehold } from "@/lib/session"
import {
  listPackingBundles,
  listPackingLists,
  type PackingListSummary,
} from "@/lib/application/packing/read"
import {
  DURATION_SHORT_LABELS,
  DURATION_SLUGS,
  PACKING_DURATIONS,
  PACKING_SEASONS,
  SEASON_LABELS,
  SEASON_SLUGS,
  durationFromSlug,
  formatDeparture,
  seasonFromSlug,
} from "@/lib/packing-labels"
import { FilterChipRow } from "./filter-chips"
import { NewPackingListButton } from "./packing-list-form-dialog"
import { TripBadges } from "./trip-badges"

interface PakkelisterPageProps {
  searchParams: Promise<{ sesong?: string; varighet?: string; utland?: string }>
}

export default async function PakkelisterPage({
  searchParams,
}: PakkelisterPageProps) {
  const params = await searchParams
  const { context } = await requireHousehold()

  const season = seasonFromSlug(params.sesong)
  const duration = durationFromSlug(params.varighet)
  const abroad =
    params.utland === "ja" ? true : params.utland === "nei" ? false : undefined
  const isFiltered =
    season !== undefined || duration !== undefined || abroad !== undefined

  const [lists, allCount, bundles] = await Promise.all([
    listPackingLists(context, { season, duration, abroad }),
    isFiltered
      ? listPackingLists(context).then((all) => all.length)
      : Promise.resolve(null),
    listPackingBundles(context),
  ])
  const totalCount = allCount ?? lists.length

  const current = {
    sesong: season ? SEASON_SLUGS[season] : undefined,
    varighet: duration ? DURATION_SLUGS[duration] : undefined,
    utland: abroad === undefined ? undefined : abroad ? "ja" : "nei",
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Pakkelister
          </h1>
          <p className="text-sm text-muted-foreground">
            Pakk til turen med gjenbrukbare pakker av ting som hører sammen
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/pakkelister/pakker">
              <Package className="h-4 w-4" data-icon="inline-start" />
              Pakker ({bundles.length})
            </Link>
          </Button>
          <NewPackingListButton
            bundles={bundles.map((bundle) => ({
              id: bundle.id,
              name: bundle.name,
              seasons: bundle.seasons,
              durations: bundle.durations,
              abroadOnly: bundle.abroadOnly,
              autoAdd: bundle.autoAdd,
              items: bundle.items.map((item) => ({ id: item.id })),
            }))}
          />
        </div>
      </div>

      {totalCount > 0 && (
        <div className="flex flex-col gap-2">
          <FilterChipRow
            label="Sesong"
            param="sesong"
            basePath="/pakkelister"
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
            basePath="/pakkelister"
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
          <FilterChipRow
            label="Reise"
            param="utland"
            basePath="/pakkelister"
            params={current}
            current={current.utland}
            options={[
              { value: undefined, label: "Alle" },
              { value: "ja", label: "Utenlands" },
              { value: "nei", label: "Innenlands" },
            ]}
          />
        </div>
      )}

      {totalCount === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <Luggage className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="font-heading text-lg font-medium">
            Ingen pakkelister ennå
          </h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Lag en pakkeliste for neste tur, eller be en assistent koblet til
            via MCP om å lage den. Lag gjerne pakker først, så kommer tingene
            med automatisk.
          </p>
        </Card>
      ) : lists.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Ingen pakkelister passer filteret.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <PackingListCard key={list.id} list={list} />
          ))}
        </div>
      )}
    </div>
  )
}

function PackingListCard({ list }: { list: PackingListSummary }) {
  const total = list.items.length
  const packed = list.items.filter((item) => item.packed).length
  const percent = total > 0 ? Math.round((packed / total) * 100) : 0

  return (
    <Link href={`/pakkelister/${list.id}`} className="group">
      <Card className="h-full transition-colors group-hover:bg-muted/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base leading-tight break-words group-hover:underline">
            {list.name}
          </CardTitle>
          {list.departureOn && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDeparture(list.departureOn)}
            </p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <TripBadges
            season={list.season}
            duration={list.duration}
            abroad={list.abroad}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground tabular-nums">
              {total === 0 ? "Ingen ting ennå" : `${packed}/${total} pakket`}
            </span>
            {total > 0 && <Progress value={percent} />}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
