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
import {
  Loader2,
  MoreVertical,
  Package,
  PackageMinus,
  Plus,
} from "lucide-react"
import { toast } from "sonner"
import {
  addBundlesToList,
  addPackingItems,
  removeBundleFromList,
  togglePackingItem,
} from "@/lib/actions/packing"
import { PackingItemRow, type PackingItemView } from "./packing-item-row"

export type ItemGroup = {
  /** Null for items added by hand. */
  bundleId: string | null
  name: string
  items: PackingItemView[]
}

export type BundleToAdd = {
  id: string
  name: string
  itemCount: number
  /** Fits the list's season, duration and abroad flag. */
  fits: boolean
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
}: {
  listId: string
  groups: ItemGroup[]
  bundlesToAdd: BundleToAdd[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [hidePacked, setHidePacked] = useState(false)
  const [newItem, setNewItem] = useState("")
  /** Packed state shown at once, while the server catches up. */
  const [packedOverrides, setPackedOverride] = useOptimistic(
    {} as Record<string, boolean>,
    (state, change: { id: string; packed: boolean }) => ({
      ...state,
      [change.id]: change.packed,
    })
  )

  const isEmpty = groups.length === 0

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
      const result = await addBundlesToList({ listId, bundleIds: [bundleId] })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      reportSkipped(result.data.skippedNames)
      router.refresh()
    })
  }

  function handleRemoveBundle(bundleId: string, keepPacked: boolean) {
    startTransition(async () => {
      const result = await removeBundleFromList({
        listId,
        bundleId,
        keepPacked,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleAddItem() {
    const name = newItem.trim()
    if (!name) return
    startTransition(async () => {
      const result = await addPackingItems({ listId, items: [{ name }] })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      reportSkipped(result.data.skippedNames)
      setNewItem("")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {bundlesToAdd.length > 0 ? (
          <Select value="" onValueChange={handleAddBundle} disabled={isPending}>
            <SelectTrigger size="sm" aria-label="Legg til pakke">
              <Package className="h-4 w-4" />
              <SelectValue placeholder="Legg til pakke" />
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
        ) : (
          <span />
        )}
        {!isEmpty && (
          <div className="flex items-center gap-2">
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
          </p>
        </Card>
      )}

      {groups.map((group) => {
        const items = group.items.map((item) => ({
          ...item,
          packed: packedOverrides[item.id] ?? item.packed,
        }))
        const packedCount = items.filter((item) => item.packed).length
        const visible = hidePacked
          ? items.filter((item) => !item.packed)
          : items

        return (
          <Card key={group.bundleId ?? "loose"} size="sm">
            <CardContent className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex min-w-0 items-center gap-2 font-heading text-base font-semibold">
                  {group.bundleId && (
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{group.name}</span>
                  <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
                    {packedCount}/{items.length}
                  </span>
                </h2>
                {group.bundleId && (
                  <BundleMenu
                    disabled={isPending}
                    hasPacked={packedCount > 0}
                    onRemove={(keepPacked) =>
                      handleRemoveBundle(group.bundleId!, keepPacked)
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
          placeholder="Legg til ting, f.eks. Solkrem"
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

function BundleMenu({
  disabled,
  hasPacked,
  onRemove,
}: {
  disabled: boolean
  hasPacked: boolean
  onRemove: (keepPacked: boolean) => void
}) {
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
          Fjern pakken fra listen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
