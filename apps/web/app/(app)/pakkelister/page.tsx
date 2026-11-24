import Link from "next/link"
import { CalendarDays, Copy, History, Luggage, Package } from "lucide-react"
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
  countPackingListsByKind,
  listPackingBundles,
  listPackingLists,
  listPackingPersons,
  type PackingListSummary,
} from "@/lib/application/packing/read"
import { cn } from "@workspace/ui/lib/utils"
import {
  DURATION_SHORT_LABELS,
  DURATION_SLUGS,
  PACKING_DURATIONS,
  PACKING_SEASONS,
  SEASON_LABELS,
  SEASON_SLUGS,
  durationFromSlug,
  KIND_LABELS,
  KIND_SLUGS,
  PACKING_LIST_KINDS,
  formatDeparture,
  kindFromSlug,
  seasonFromSlug,
  type PackingListKindValue,
} from "@/lib/packing-labels"
import { FilterChipRow } from "./filter-chips"
import { NewPackingListButton } from "./packing-list-form-dialog"
import { PersonsDialog } from "./persons-dialog"
import { TripBadges } from "./trip-badges"

interface PakkelisterPageProps {
  searchParams: Promise<{
    type?: string
    sesong?: string
    varighet?: string
    utland?: string
  }>
}

const EMPTY_TEXT: Record<
  PackingListKindValue,
  { title: string; body: string }
> = {
  TRIP: {
    title: "Ingen turer ennå",
    body: "Lag en pakkeliste for neste tur, start fra en mal, eller be en assistent koblet til via MCP om å lage den. Lag gjerne pakker først, så kommer tingene med automatisk.",
  },
  TEMPLATE: {
    title: "Ingen maler ennå",
    body: "En mal er et utgangspunkt du starter nye turer fra, f.eks. «Hytta vinter». Den krysses aldri av, og kan oppdateres når pakkene endres.",
  },
  ARCHIVED: {
    title: "Ingen fullførte turer",
    body: "Når en tur er over, velg «Fullfør tur» i menyen på listen. Den flyttes hit, og kan brukes som utgangspunkt senere.",
  },
}

export default async function PakkelisterPage({
  searchParams,
}: PakkelisterPageProps) {
  const params = await searchParams
  const { context } = await requireHousehold()

  const kind = kindFromSlug(params.type)
  const season = seasonFromSlug(params.sesong)
  const duration = durationFromSlug(params.varighet)
  const abroad =
    params.utland === "ja" ? true : params.utland === "nei" ? false : undefined

  const [lists, counts, bundles, persons, templates] = await Promise.all([
    listPackingLists(context, { kind, season, duration, abroad }),
    countPackingListsByKind(context),
    listPackingBundles(context),
    listPackingPersons(context),
    listPackingLists(context, { kind: "TEMPLATE" }),
  ])
  const totalCount = counts[kind]

  const current = {
    type: KIND_SLUGS[kind],
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
          <PersonsDialog
            persons={persons.map(({ id, name }) => ({ id, name }))}
          />
          <NewPackingListButton
            kind={kind === "TEMPLATE" ? "TEMPLATE" : "TRIP"}
            templates={templates.map((template) => ({
              id: template.id,
              name: template.name,
              season: template.season,
              duration: template.duration,
              abroad: template.abroad,
              itemCount: template.items.length,
            }))}
            bundles={bundles.map((bundle) => ({
              id: bundle.id,
              name: bundle.name,
              seasons: bundle.seasons,
              durations: bundle.durations,
              abroadOnly: bundle.abroadOnly,
              autoAdd: bundle.autoAdd,
              personName: bundle.person?.name ?? null,
              items: bundle.items.map((item) => ({ id: item.id })),
            }))}
          />
        </div>
      </div>

      <KindTabs current={kind} counts={counts} />

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
          {kind === "TEMPLATE" ? (
            <Copy className="mb-4 h-12 w-12 text-muted-foreground" />
          ) : kind === "ARCHIVED" ? (
            <History className="mb-4 h-12 w-12 text-muted-foreground" />
          ) : (
            <Luggage className="mb-4 h-12 w-12 text-muted-foreground" />
          )}
          <h3 className="font-heading text-lg font-medium">
            {EMPTY_TEXT[kind].title}
          </h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {EMPTY_TEXT[kind].body}
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

/** Turer · Maler · Historikk, each with how many lists it has. */
function KindTabs({
  current,
  counts,
}: {
  current: PackingListKindValue
  counts: Record<PackingListKindValue, number>
}) {
  return (
    <nav
      aria-label="Type pakkeliste"
      className="-mt-2 flex gap-1 border-b border-border"
    >
      {PACKING_LIST_KINDS.map((kind) => {
        const slug = KIND_SLUGS[kind]
        const active = kind === current
        return (
          <Link
            key={kind}
            href={slug ? `/pakkelister?type=${slug}` : "/pakkelister"}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {KIND_LABELS[kind]}
            <span className="text-xs text-muted-foreground tabular-nums">
              {counts[kind]}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

function PackingListCard({ list }: { list: PackingListSummary }) {
  const total = list.items.length
  const packed = list.items.filter((item) => item.packed).length
  const percent = total > 0 ? Math.round((packed / total) * 100) : 0
  const isTemplate = list.kind === "TEMPLATE"

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
          {isTemplate ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {total === 0 ? "Ingen ting ennå" : `${total} ting`}
            </span>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground tabular-nums">
                {total === 0 ? "Ingen ting ennå" : `${packed}/${total} pakket`}
              </span>
              {total > 0 && <Progress value={percent} />}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
