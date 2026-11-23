"use client"

import { useOptimistic, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import {
  CheckCheck,
  Loader2,
  MoreVertical,
  Package,
  PackageMinus,
  Plus,
  User,
} from "lucide-react"
import { toast } from "sonner"
import {
  addBundlesToList,
  addPackingItems,
  removeBundleFromList,
  setAllPackingItemsPacked,
  togglePackingItem,
} from "@/lib/actions/packing"
import { PersonsDialog, type PackingPersonOption } from "../persons-dialog"
import { PackingItemRow, type PackingItemView } from "./packing-item-row"

export type ItemGroup = {
  key: string
  /** Null for items added by hand. */
  bundleId: string | null
  /** Who this copy of the bundle is for; null for shared and loose items. */
  personId: string | null
  name: string
  personName: string | null
  items: PackingItemView[]
}

export type BundleToAdd = {
  id: string
  name: string
  itemCount: number
  /** Fits the list's season, duration and abroad flag. */
  fits: boolean
}

/** The person filter: everyone, the shared things, or one person. */
type PersonFilter = { kind: "all" } | { kind: "person"; id: string | null }

const SHARED = "__shared__"

function reportSkipped(skippedNames: string[]) {
  if (skippedNames.length === 1) {
    toast.info(`«${skippedNames[0]}» sto allerede på listen`)
  } else if (skippedNames.length > 1) {
    toast.info(`${skippedNames.length} ting fantes allerede på listen`)
  }
}

export function PackingItems({
  listId,
  groups,
  bundlesToAdd,
  persons,
}: {
  listId: string
  groups: ItemGroup[]
  bundlesToAdd: BundleToAdd[]
  persons: PackingPersonOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [hidePacked, setHidePacked] = useState(false)
  const [newItem, setNewItem] = useState("")
  const [filter, setFilter] = useState<PersonFilter>({ kind: "all" })
  /** Who new things and bundles are for: a person id, or SHARED. */
  const [packFor, setPackFor] = useState(SHARED)
  /** Packed state shown at once, while the server catches up. */
  const [packedOverrides, setPackedOverride] = useOptimistic(
    {} as Record<string, boolean>,
    (state, change: { id: string; packed: boolean }) => ({
      ...state,
      [change.id]: change.packed,
    })
  )

  const allItems = groups.flatMap((group) => group.items)
  const isEmpty = allItems.length === 0
  const targetPersonId = packFor === SHARED ? null : packFor
  const targetName =
    persons.find((person) => person.id === targetPersonId)?.name ?? null

  function isPacked(item: PackingItemView) {
    return packedOverrides[item.id] ?? item.packed
  }

  function matchesFilter(item: PackingItemView) {
    return filter.kind === "all" || item.personId === filter.id
  }

  /** Filtering on a person also makes them the one new things are for. */
  function selectFilter(next: PersonFilter) {
    setFilter(next)
    if (next.kind === "person") setPackFor(next.id ?? SHARED)
  }

  function handleToggle(item: PackingItemView, packed: boolean) {
    startTransition(async () => {
      setPackedOverride({ id: item.id, packed })
      const result = await togglePackingItem({ id: item.id, packed })
      if (!result.ok) toast.error(result.error)
      router.refresh()
    })
  }

  function handleAddBundle(bundleId: string) {
    startTransition(async () => {
      const result = await addBundlesToList({
        listId,
        bundleIds: [bundleId],
        personId: targetPersonId,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      reportSkipped(result.data.skippedNames)
      router.refresh()
    })
  }

  function handleRemoveBundle(group: ItemGroup, keepPacked: boolean) {
    startTransition(async () => {
      const result = await removeBundleFromList({
        listId,
        bundleId: group.bundleId!,
        keepPacked,
        personId: group.personId,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  function handlePackAllForFilter() {
    if (filter.kind !== "person") return
    startTransition(async () => {
      const result = await setAllPackingItemsPacked({
        listId,
        packed: true,
        personId: filter.id,
      })
      if (!result.ok) toast.error(result.error)
      router.refresh()
    })
  }

  function handleAddItem() {
    const name = newItem.trim()
    if (!name) return
    startTransition(async () => {
      const result = await addPackingItems({
        listId,
        items: [{ name, personId: targetPersonId }],
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      reportSkipped(result.data.skippedNames)
      setNewItem("")
      router.refresh()
    })
  }

  const filtered = filter.kind !== "all"
  const filteredItems = allItems.filter(matchesFilter)
  const unpackedInFilter = filteredItems.filter((item) => !isPacked(item))

  return (
    <div className="flex flex-col gap-4">
      {(persons.length > 0 || !isEmpty) && (
        <PersonChips
          persons={persons}
          items={allItems}
          isPacked={isPacked}
          filter={filter}
          onSelect={selectFilter}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {persons.length > 0 && (
          <Select value={packFor} onValueChange={setPackFor}>
            <SelectTrigger size="sm" aria-label="Pakk for">
              <User className="h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SHARED}>Felles</SelectItem>
              {persons.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {bundlesToAdd.length > 0 && (
          <Select value="" onValueChange={handleAddBundle} disabled={isPending}>
            <SelectTrigger size="sm" aria-label="Legg til pakke">
              <Package className="h-4 w-4" />
              <SelectValue
                placeholder={
                  targetName
                    ? `Legg til pakke for ${targetName}`
                    : "Legg til pakke"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {bundlesToAdd.map((bundle) => (
                <SelectItem key={bundle.id} value={bundle.id}>
                  {bundle.name} ({bundle.itemCount} ting)
                  {bundle.fits ? " · passer" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <PersonsDialog persons={persons} />
        {!isEmpty && (
          <div className="ml-auto flex items-center gap-2">
            <Switch
              id="hide-packed"
              checked={hidePacked}
              onCheckedChange={setHidePacked}
            />
            <Label htmlFor="hide-packed" className="text-sm font-normal">
              Skjul pakket
            </Label>
          </div>
        )}
      </div>

      {isEmpty && (
        <Card className="flex flex-col items-center justify-center px-4 py-10 text-center">
          <Package className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Listen er tom</p>
          <p className="text-xs text-muted-foreground">
            Legg til en pakke, eller skriv inn ting nedenfor
            {persons.length === 0
              ? ". Pakker du for flere, legg dem til under Personer."
              : ""}
          </p>
        </Card>
      )}

      {filter.kind === "person" && unpackedInFilter.length > 0 && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePackAllForFilter}
            disabled={isPending}
          >
            <CheckCheck className="h-4 w-4" data-icon="inline-start" />
            Merk alt{" "}
            {filter.id
              ? `til ${persons.find((person) => person.id === filter.id)?.name ?? ""}`
              : "felles"}{" "}
            som pakket
          </Button>
        </div>
      )}

      {!isEmpty && filtered && filteredItems.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ingenting på listen for dette valget ennå.
        </p>
      )}

      {groups.map((group) => {
        const items = group.items
          .filter(matchesFilter)
          .map((item) => ({ ...item, packed: isPacked(item) }))
        if (items.length === 0) return null
        const packedCount = items.filter((item) => item.packed).length
        const visible = hidePacked
          ? items.filter((item) => !item.packed)
          : items

        return (
          <Card key={group.key} size="sm">
            <CardContent className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex min-w-0 items-center gap-2 font-heading text-base font-semibold">
                  {group.bundleId && (
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">
                    {group.name}
                    {group.personName && (
                      <span className="font-sans text-sm font-normal text-muted-foreground">
                        {" "}
                        · {group.personName}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
                    {packedCount}/{items.length}
                  </span>
                </h2>
                {group.bundleId && (
                  <BundleMenu
                    disabled={isPending}
                    hasPacked={packedCount > 0}
                    personName={group.personName}
                    onRemove={(keepPacked) =>
                      handleRemoveBundle(group, keepPacked)
                    }
                  />
                )}
              </div>
              {visible.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Alt er pakket
                </p>
              ) : (
                <ul className="flex flex-col">
                  {visible.map((item) => (
                    <PackingItemRow
                      key={item.id}
                      item={item}
                      persons={persons}
                      // A bundle section or a person filter already says who.
                      showPerson={!group.bundleId && !filtered}
                      onToggle={(packed) => handleToggle(item, packed)}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )
      })}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          handleAddItem()
        }}
      >
        <Input
          placeholder={
            targetName
              ? `Legg til ting for ${targetName}`
              : "Legg til ting, f.eks. Solkrem"
          }
          aria-label="Legg til ting"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          disabled={isPending}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={isPending || !newItem.trim()}
          aria-label="Legg til"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  )
}

/** Alle · Felles · one chip per person, each with how much is packed. */
function PersonChips({
  persons,
  items,
  isPacked,
  filter,
  onSelect,
}: {
  persons: PackingPersonOption[]
  items: PackingItemView[]
  isPacked: (item: PackingItemView) => boolean
  filter: PersonFilter
  onSelect: (filter: PersonFilter) => void
}) {
  if (persons.length === 0) return null

  function progress(personId: string | null) {
    const own = items.filter((item) => item.personId === personId)
    return `${own.filter(isPacked).length}/${own.length}`
  }

  const chips: Array<{ key: string; label: string; value: PersonFilter }> = [
    { key: "all", label: "Alle", value: { kind: "all" } },
    {
      key: "shared",
      label: `Felles ${progress(null)}`,
      value: { kind: "person", id: null },
    },
    ...persons.map((person) => ({
      key: person.id,
      label: `${person.name} ${progress(person.id)}`,
      value: { kind: "person" as const, id: person.id },
    })),
  ]

  return (
    <div className="flex items-start gap-2">
      <span className="flex h-6.5 w-14 shrink-0 items-center text-xs text-muted-foreground">
        Person
      </span>
      <div
        role="radiogroup"
        aria-label="Vis ting for"
        className="flex min-w-0 flex-1 flex-wrap gap-1.5"
      >
        {chips.map((chip) => {
          const active =
            chip.value.kind === filter.kind &&
            (chip.value.kind === "all" ||
              (filter.kind === "person" && chip.value.id === filter.id))
          return (
            <button
              key={chip.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(chip.value)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap tabular-nums transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function BundleMenu({
  disabled,
  hasPacked,
  personName,
  onRemove,
}: {
  disabled: boolean
  hasPacked: boolean
  personName: string | null
  onRemove: (keepPacked: boolean) => void
}) {
  const forWhom = personName ? ` for ${personName}` : ""
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="Handlinger for pakken"
          disabled={disabled}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasPacked && (
          <DropdownMenuItem onSelect={() => onRemove(true)}>
            <PackageMinus className="mr-2 h-4 w-4" />
            Fjern det som ikke er pakket
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onRemove(false)}
        >
          <PackageMinus className="mr-2 h-4 w-4" />
          Fjern pakken{forWhom} fra listen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
