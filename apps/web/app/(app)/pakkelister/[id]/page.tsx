import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarDays, Copy, History } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Progress } from "@workspace/ui/components/progress"
import {
  getPackingList,
  listPackingBundles,
  listPackingPersons,
} from "@/lib/application/packing/read"
import { bundleFitsTrip } from "@/lib/application/packing/rules"
import { KIND_SLUGS, formatDeparture } from "@/lib/packing-labels"
import { requireHousehold } from "@/lib/session"
import { StartTripButton } from "../packing-list-form-dialog"
import { TripBadges } from "../trip-badges"
import { ListActions } from "./list-actions"
import { PackingItems, type BundleToAdd, type ItemGroup } from "./packing-items"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PackingListPageProps {
  params: Promise<{ id: string }>
}

export default async function PackingListPage({
  params,
}: PackingListPageProps) {
  const { id } = await params
  if (!UUID_PATTERN.test(id)) notFound()

  const { context } = await requireHousehold()
  const [list, bundles, persons] = await Promise.all([
    getPackingList(context, id),
    listPackingBundles(context),
    listPackingPersons(context),
  ])
  if (!list) notFound()

  const total = list.items.length
  const packed = list.items.filter((item) => item.packed).length
  const percent = total > 0 ? Math.round((packed / total) * 100) : 0

  // Sections: one per bundle and person ("Vintertøy barn · Ola") in the order
  // they first appear, then the sub-lists in their order (empty ones too, so
  // things can be added to them), then the loose items.
  const bundleSections: ItemGroup[] = []
  const subLists: ItemGroup[] = list.groups.map((group) => ({
    key: `group:${group.id}`,
    kind: "group",
    bundleId: null,
    groupId: group.id,
    personId: null,
    name: group.name,
    personName: null,
    items: [],
  }))
  const loose: ItemGroup = {
    key: "loose",
    kind: "loose",
    bundleId: null,
    groupId: null,
    personId: null,
    name: "Andre ting",
    personName: null,
    items: [],
  }
  for (const item of list.items) {
    let section: ItemGroup | undefined
    if (item.groupId) {
      section = subLists.find((entry) => entry.groupId === item.groupId)
    } else if (item.bundle) {
      const bundleId = item.bundle.id
      section = bundleSections.find(
        (entry) =>
          entry.bundleId === bundleId && entry.personId === item.personId
      )
      if (!section) {
        section = {
          key: `${bundleId}:${item.personId ?? "shared"}`,
          kind: "bundle",
          bundleId,
          groupId: null,
          personId: item.personId,
          name: item.bundle.name,
          personName: item.person?.name ?? null,
          items: [],
        }
        bundleSections.push(section)
      }
    }
    ;(section ?? loose).items.push({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
      packed: item.packed,
      personId: item.personId,
      personName: item.person?.name ?? null,
      groupId: item.groupId,
    })
  }
  const groups = [...bundleSections, ...subLists, loose]
  const isTemplate = list.kind === "TEMPLATE"
  const isArchived = list.kind === "ARCHIVED"
  const backSlug = KIND_SLUGS[list.kind]

  // A bundle can be added once per person, so every bundle stays on offer.
  const bundlesToAdd: BundleToAdd[] = bundles
    .map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      itemCount: bundle.items.length,
      personName: bundle.person?.name ?? null,
      fits: bundleFitsTrip(bundle, list),
    }))
    .sort(
      (a, b) =>
        Number(b.fits) - Number(a.fits) || a.name.localeCompare(b.name, "nb-NO")
    )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 self-start" asChild>
          <Link
            href={backSlug ? `/pakkelister?type=${backSlug}` : "/pakkelister"}
          >
            <ArrowLeft className="h-4 w-4" data-icon="inline-start" />
            {isTemplate ? "Maler" : isArchived ? "Historikk" : "Pakkelister"}
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            {(isTemplate || isArchived) && (
              <Badge variant="secondary" className="self-start text-xs">
                {isTemplate ? (
                  <Copy className="mr-1 h-3 w-3" />
                ) : (
                  <History className="mr-1 h-3 w-3" />
                )}
                {isTemplate ? "Mal" : "Fullført tur"}
              </Badge>
            )}
            <h1 className="font-heading text-2xl font-bold tracking-tight break-words">
              {list.name}
            </h1>
            {list.departureOn && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                Avreise {formatDeparture(list.departureOn)}
              </p>
            )}
            <TripBadges
              season={list.season}
              duration={list.duration}
              abroad={list.abroad}
            />
          </div>
          <ListActions
            list={{
              id: list.id,
              name: list.name,
              kind: list.kind,
              season: list.season,
              duration: list.duration,
              abroad: list.abroad,
              departureOn: list.departureOn,
              notes: list.notes,
            }}
            hasPacked={packed > 0}
          />
        </div>
        {list.notes && (
          <p className="text-sm whitespace-pre-line text-muted-foreground">
            {list.notes}
          </p>
        )}
        {isTemplate && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              En mal krysses ikke av. Start en tur fra den når du skal pakke.
            </p>
            <StartTripButton
              template={{
                id: list.id,
                name: list.name,
                season: list.season,
                duration: list.duration,
                abroad: list.abroad,
                itemCount: total,
              }}
            />
          </div>
        )}
        {isArchived && (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Turen er fullført. Gjenåpne den i menyen, eller bruk den som
            utgangspunkt for en ny tur.
          </p>
        )}
        {!isTemplate && total > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground tabular-nums">
              {packed}/{total} pakket
            </span>
            <Progress value={percent} />
          </div>
        )}
      </div>

      <PackingItems
        listId={list.id}
        checkable={!isTemplate}
        groups={groups}
        bundlesToAdd={bundlesToAdd}
        persons={persons.map(({ id, name }) => ({ id, name }))}
      />
    </div>
  )
}
