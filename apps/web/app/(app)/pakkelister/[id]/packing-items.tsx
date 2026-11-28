"use client"

import {
  useOptimistic,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react"
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
  ListPlus,
  ListTree,
  Loader2,
  MoreVertical,
  Package,
  PackageMinus,
  Pencil,
  Plus,
  Trash2,
  User,
} from "lucide-react"
import { toast } from "sonner"
import {
  addBundlesToList,
  addPackingItems,
  createPackingGroup,
  deletePackingGroup,
  removeBundleFromList,
  renamePackingGroup,
  setAllPackingItemsPacked,
  togglePackingItem,
} from "@/lib/actions/packing"
import { CATEGORY_LABELS, PACKING_CATEGORIES } from "@/lib/packing-labels"
import { PersonsDialog, type PackingPersonOption } from "../persons-dialog"
import {
  PackingItemRow,
  type PackingGroupOption,
  type PackingItemView,
} from "./packing-item-row"

/**
 * A section on the list: a bundle's things, a sub-list, or the rest; or, when
 * the list is shown by category, one category.
 */
export type ItemGroup = {
  key: string
  kind: "bundle" | "group" | "loose" | "category"
  /** The bundle, for a bundle section. */
  bundleId: string | null
  /** The sub-list, for a sub-list section. */
  groupId: string | null
  /** Who this copy of the bundle is for; null for shared and other items. */
  personId: string | null
  name: string
  personName: string | null
  items: PackingItemView[]
}

export type BundleToAdd = {
  id: string
  name: string
  itemCount: number
  /** Whose bundle it is; its things go to them unless "pakk for" says else. */
  personName: string | null
  /** Fits the list's season, duration and abroad flag. */
  fits: boolean
}

/** The person filter: everyone, the shared things, or one person. */
type PersonFilter = { kind: "all" } | { kind: "person"; id: string | null }

/** By bundle and sub-list, as the list is put together, or by category. */
type ListView = "bundles" | "categories"

const SHARED = "__shared__"

/** Remembered in this browser only; a convenience, not a setting. */
const VIEW_STORAGE_KEY = "pakkeliste-visning"

/** Used when storage is blocked, so the choice still lasts for the visit. */
let fallbackView: ListView = "bundles"
const viewListeners = new Set<() => void>()

function readStoredView(): ListView {
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return stored === "categories" || stored === "bundles"
      ? stored
      : fallbackView
  } catch {
    return fallbackView
  }
}

function storeView(view: ListView) {
  fallbackView = view
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view)
  } catch {
    // Private windows and blocked storage: the fallback keeps it.
  }
  for (const listener of viewListeners) listener()
}

function subscribeToView(listener: () => void) {
  viewListeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    viewListeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

/** The chosen view; by bundle on the server and until the browser says. */
function useListView() {
  return useSyncExternalStore(
    subscribeToView,
    readStoredView,
    () => "bundles" as const
  )
}

/** One section per category in display order, things by name within it. */
function categorySections(items: PackingItemView[]): ItemGroup[] {
  return PACKING_CATEGORIES.map((category) => ({
    key: `category:${category}`,
    kind: "category" as const,
    bundleId: null,
    groupId: null,
    personId: null,
    name: CATEGORY_LABELS[category],
    personName: null,
    items: items
      .filter((item) => item.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, "nb-NO")),
  })).filter((section) => section.items.length > 0)
}

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
  checkable,
}: {
  listId: string
  groups: ItemGroup[]
  bundlesToAdd: BundleToAdd[]
  persons: PackingPersonOption[]
  /** Off for a template, which is never packed. */
  checkable: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [hidePacked, setHidePacked] = useState(false)
  const [newItem, setNewItem] = useState("")
  const [filter, setFilter] = useState<PersonFilter>({ kind: "all" })
  const view = useListView()
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

  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroup, setNewGroup] = useState("")

  const allItems = groups.flatMap((group) => group.items)
  const isEmpty = allItems.length === 0
  const subLists: PackingGroupOption[] = groups
    .filter((group) => group.kind === "group")
    .map((group) => ({ id: group.groupId!, name: group.name }))
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
        // Without a chosen person, the bundle's own person gets its things.
        personId: targetPersonId ?? undefined,
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

  /** Adds to a sub-list; resolves true when it was added. */
  function handleAddToGroup(groupId: string, name: string) {
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const result = await addPackingItems({
          listId,
          items: [{ name, personId: targetPersonId, groupId }],
        })
        if (!result.ok) {
          toast.error(result.error)
          resolve(false)
          return
        }
        reportSkipped(result.data.skippedNames)
        router.refresh()
        resolve(true)
      })
    })
  }

  function handleCreateGroup() {
    const name = newGroup.trim()
    if (!name) return
    startTransition(async () => {
      const result = await createPackingGroup({ listId, name })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setNewGroup("")
      setAddingGroup(false)
      router.refresh()
    })
  }

  function handleRenameGroup(groupId: string, name: string) {
    startTransition(async () => {
      const result = await renamePackingGroup({ id: groupId, name })
      if (!result.ok) toast.error(result.error)
      router.refresh()
    })
  }

  function handleDeleteGroup(groupId: string, keepItems: boolean) {
    startTransition(async () => {
      const result = await deletePackingGroup({ id: groupId, keepItems })
      if (!result.ok) toast.error(result.error)
      router.refresh()
    })
  }

  const filtered = filter.kind !== "all"
  const byCategory = view === "categories"
  const sections = byCategory ? categorySections(allItems) : groups
  const filteredItems = allItems.filter(matchesFilter)
  const unpackedInFilter = filteredItems.filter((item) => !isPacked(item))

  return (
    <div className="flex flex-col gap-4">
      {(persons.length > 0 || !isEmpty) && (
        <PersonChips
          persons={persons}
          checkable={checkable}
          items={allItems}
          isPacked={isPacked}
          filter={filter}
          onSelect={selectFilter}
        />
      )}

      {!isEmpty && <ViewChips view={view} onSelect={storeView} />}

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
                  {bundle.personName && !targetName
                    ? ` · til ${bundle.personName}`
                    : ""}
                  {bundle.fits ? " · passer" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddingGroup((open) => !open)}
          aria-expanded={addingGroup}
        >
          <ListPlus className="h-4 w-4" data-icon="inline-start" />
          Underliste
        </Button>
        <PersonsDialog persons={persons} />
        {checkable && !isEmpty && (
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

      {addingGroup && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            handleCreateGroup()
          }}
        >
          <Input
            autoFocus
            placeholder="Navn på underlisten, f.eks. Til bilen"
            aria-label="Navn på underlisten"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            disabled={isPending}
          />
          <Button
            type="submit"
            disabled={isPending || !newGroup.trim()}
            aria-label="Opprett underliste"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      )}

      {isEmpty && subLists.length === 0 && (
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

      {checkable && filter.kind === "person" && unpackedInFilter.length > 0 && (
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

      {sections.map((group) => {
        const items = group.items
          .filter(matchesFilter)
          .map((item) => ({ ...item, packed: isPacked(item) }))
        // An empty sub-list still shows, so things can be added to it.
        if (items.length === 0 && (group.kind !== "group" || filtered)) {
          return null
        }
        const packedCount = items.filter((item) => item.packed).length
        const visible =
          checkable && hidePacked ? items.filter((item) => !item.packed) : items

        return (
          <Card key={group.key} size="sm">
            <CardContent className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex min-w-0 items-center gap-2 font-heading text-base font-semibold">
                  {group.kind === "bundle" && (
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  {group.kind === "group" && (
                    <ListTree className="h-4 w-4 shrink-0 text-muted-foreground" />
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
                    {checkable
                      ? `${packedCount}/${items.length}`
                      : `${items.length}`}
                  </span>
                </h2>
                {group.kind === "bundle" && (
                  <BundleMenu
                    disabled={isPending}
                    hasPacked={checkable && packedCount > 0}
                    personName={group.personName}
                    onRemove={(keepPacked) =>
                      handleRemoveBundle(group, keepPacked)
                    }
                  />
                )}
                {group.kind === "group" && (
                  <GroupMenu
                    name={group.name}
                    hasItems={items.length > 0}
                    disabled={isPending}
                    onRename={(name) => handleRenameGroup(group.groupId!, name)}
                    onDelete={(keepItems) =>
                      handleDeleteGroup(group.groupId!, keepItems)
                    }
                  />
                )}
              </div>
              {visible.length === 0 ? (
                items.length > 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    Alt er pakket
                  </p>
                ) : null
              ) : (
                <ul className="flex flex-col">
                  {visible.map((item) => (
                    <PackingItemRow
                      key={item.id}
                      item={item}
                      persons={persons}
                      groups={subLists}
                      checkable={checkable}
                      // A bundle section or a person filter already says who.
                      showPerson={group.kind !== "bundle" && !filtered}
                      showSource={byCategory}
                      onToggle={(packed) => handleToggle(item, packed)}
                    />
                  ))}
                </ul>
              )}
              {group.kind === "group" && (
                <AddToGroupForm
                  groupName={group.name}
                  targetName={targetName}
                  disabled={isPending}
                  onAdd={(name) => handleAddToGroup(group.groupId!, name)}
                />
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

/** Pakker · Kategorier: how the list is divided into sections. */
function ViewChips({
  view,
  onSelect,
}: {
  view: ListView
  onSelect: (view: ListView) => void
}) {
  const options: Array<{ value: ListView; label: string }> = [
    { value: "bundles", label: "Pakker" },
    { value: "categories", label: "Kategorier" },
  ]
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-6.5 w-14 shrink-0 items-center text-xs text-muted-foreground">
        Vis etter
      </span>
      <div
        role="radiogroup"
        aria-label="Vis listen etter"
        className="flex min-w-0 flex-1 flex-wrap gap-1.5"
      >
        {options.map((option) => (
          <Chip
            key={option.value}
            active={view === option.value}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap tabular-nums transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

/** Alle · Felles · one chip per person, each with how much is packed. */
function PersonChips({
  persons,
  checkable,
  items,
  isPacked,
  filter,
  onSelect,
}: {
  persons: PackingPersonOption[]
  checkable: boolean
  items: PackingItemView[]
  isPacked: (item: PackingItemView) => boolean
  filter: PersonFilter
  onSelect: (filter: PersonFilter) => void
}) {
  if (persons.length === 0) return null

  function progress(personId: string | null) {
    const own = items.filter((item) => item.personId === personId)
    return checkable
      ? `${own.filter(isPacked).length}/${own.length}`
      : `${own.length}`
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
            <Chip
              key={chip.key}
              active={active}
              onClick={() => onSelect(chip.value)}
            >
              {chip.label}
            </Chip>
          )
        })}
      </div>
    </div>
  )
}

/** The add field at the bottom of a sub-list. */
function AddToGroupForm({
  groupName,
  targetName,
  disabled,
  onAdd,
}: {
  groupName: string
  targetName: string | null
  disabled: boolean
  onAdd: (name: string) => Promise<boolean>
}) {
  const [name, setName] = useState("")

  return (
    <form
      className="mt-1 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const trimmed = name.trim()
        if (!trimmed) return
        if (await onAdd(trimmed)) setName("")
      }}
    >
      <Input
        className="h-9"
        placeholder={
          targetName
            ? `Legg til i ${groupName} for ${targetName}`
            : `Legg til i ${groupName}`
        }
        aria-label={`Legg til i ${groupName}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={disabled}
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        disabled={disabled || !name.trim()}
        aria-label={`Legg til i ${groupName}`}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </form>
  )
}

function GroupMenu({
  name,
  hasItems,
  disabled,
  onRename,
  onDelete,
}: {
  name: string
  hasItems: boolean
  disabled: boolean
  onRename: (name: string) => void
  onDelete: (keepItems: boolean) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(name)
  const [confirming, setConfirming] = useState(false)

  if (renaming) {
    return (
      <form
        className="flex min-w-0 gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          const trimmed = draft.trim()
          if (trimmed && trimmed !== name) onRename(trimmed)
          setRenaming(false)
        }}
      >
        <Input
          autoFocus
          className="h-8 w-40"
          aria-label="Nytt navn"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setRenaming(false)
          }}
        />
        <Button type="submit" size="sm" variant="outline">
          Lagre
        </Button>
      </form>
    )
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setConfirming(false)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={`Handlinger for ${name}`}
          disabled={disabled}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            setDraft(name)
            setRenaming(true)
          }}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Gi nytt navn
        </DropdownMenuItem>
        {hasItems && (
          <DropdownMenuItem onSelect={() => onDelete(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Fjern underlisten, behold tingene
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          onSelect={(e) => {
            if (hasItems && !confirming) {
              e.preventDefault()
              setConfirming(true)
              return
            }
            onDelete(false)
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {!hasItems
            ? "Slett underlisten"
            : confirming
              ? "Bekreft – tingene slettes også"
              : "Slett underlisten med tingene"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
