import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarDays } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Progress } from "@workspace/ui/components/progress"
import {
  getPackingList,
  listPackingBundles,
  listPackingPersons,
} from "@/lib/application/packing/read"
import { bundleFitsTrip } from "@/lib/application/packing/rules"
import { formatDeparture } from "@/lib/packing-labels"
import { requireHousehold } from "@/lib/session"
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

  // One group per bundle and person on the list ("Vintertøy barn · Ola"), in
  // the order they first appear, then the loose items.
  const groups: ItemGroup[] = []
  for (const item of list.items) {
    const bundleId = item.bundle?.id ?? null
    const personId = bundleId ? item.personId : null
    let group = groups.find(
      (entry) => entry.bundleId === bundleId && entry.personId === personId
    )
    if (!group) {
      group = {
        key: `${bundleId ?? "loose"}:${personId ?? "shared"}`,
        bundleId,
        personId,
        name: item.bundle?.name ?? "Andre ting",
        personName: bundleId ? (item.person?.name ?? null) : null,
        items: [],
      }
      groups.push(group)
    }
    group.items.push({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
      packed: item.packed,
      personId: item.personId,
      personName: item.person?.name ?? null,
    })
  }
  groups.sort(
    (a, b) => Number(a.bundleId === null) - Number(b.bundleId === null)
  )

  // A bundle can be added once per person, so every bundle stays on offer.
  const bundlesToAdd: BundleToAdd[] = bundles
    .map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      itemCount: bundle.items.length,
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
          <Link href="/pakkelister">
            <ArrowLeft className="h-4 w-4" data-icon="inline-start" />
            Pakkelister
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
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
        {total > 0 && (
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
        groups={groups}
        bundlesToAdd={bundlesToAdd}
        persons={persons.map(({ id, name }) => ({ id, name }))}
      />
    </div>
  )
}
