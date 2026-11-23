"use client"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Loader2, Plus, Save } from "lucide-react"
import { toast } from "sonner"
import {
  bundleFitsTrip,
  type BundleConditions,
  type PackingDurationValue,
  type PackingSeasonValue,
} from "@/lib/application/packing/rules"
import { createPackingList, updatePackingList } from "@/lib/actions/packing"
import {
  DURATION_LABELS,
  PACKING_DURATIONS,
  PACKING_SEASONS,
  SEASON_LABELS,
  describeBundleConditions,
  toDateInputValue,
} from "@/lib/packing-labels"

const NONE = "__none__"

export type BundleOption = BundleConditions & {
  id: string
  name: string
  autoAdd: boolean
  items: Array<{ id: string }>
}

export type EditableList = {
  id: string
  name: string
  season: PackingSeasonValue | null
  duration: PackingDurationValue | null
  abroad: boolean
  departureOn: Date | null
  notes: string | null
}

/**
 * Creates a packing list, with a bundle picker, or edits an existing list's
 * trip details. Bundles are passed explicitly, so what is checked here is
 * exactly what gets added.
 */
export function PackingListFormDialog({
  list,
  bundles = [],
  trigger,
}: {
  list?: EditableList
  bundles?: BundleOption[]
  trigger: ReactNode
}) {
  const router = useRouter()
  const isEdit = Boolean(list)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(list?.name ?? "")
  const [season, setSeason] = useState<PackingSeasonValue | null>(
    list?.season ?? null
  )
  const [duration, setDuration] = useState<PackingDurationValue | null>(
    list?.duration ?? null
  )
  const [abroad, setAbroad] = useState(list?.abroad ?? false)
  const [departureOn, setDepartureOn] = useState(
    toDateInputValue(list?.departureOn)
  )
  const [notes, setNotes] = useState(list?.notes ?? "")
  /** Bundles the user ticked or unticked; the rest follow the trip. */
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map())
  const [error, setError] = useState("")

  const trip = { season, duration, abroad }
  const options = bundles
    .map((bundle) => ({ bundle, fits: bundleFitsTrip(bundle, trip) }))
    .sort(
      (a, b) =>
        Number(b.fits) - Number(a.fits) ||
        a.bundle.name.localeCompare(b.bundle.name, "nb-NO")
    )
  const isChecked = (bundle: BundleOption, fits: boolean) =>
    overrides.get(bundle.id) ?? (bundle.autoAdd && fits)
  const checkedIds = options
    .filter(({ bundle, fits }) => isChecked(bundle, fits))
    .map(({ bundle }) => bundle.id)

  function reset() {
    setName("")
    setSeason(null)
    setDuration(null)
    setAbroad(false)
    setDepartureOn("")
    setNotes("")
    setOverrides(new Map())
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError("Navn er påkrevd")
      return
    }
    setError("")

    const fields = {
      name: name.trim(),
      season,
      duration,
      abroad,
      departureOn: departureOn || null,
      notes: notes.trim() || null,
    }

    startTransition(async () => {
      if (list) {
        const result = await updatePackingList({ id: list.id, ...fields })
        if (!result.ok) {
          setError(result.error)
          return
        }
        setOpen(false)
        router.refresh()
        return
      }

      const result = await createPackingList({
        ...fields,
        bundleIds: checkedIds,
        applyAutoBundles: false,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.data.skippedNames.length > 0) {
        toast.info(
          `${result.data.skippedNames.length} ting sto i flere pakker og ble lagt til én gang`
        )
      }
      reset()
      setOpen(false)
      router.push(`/pakkelister/${result.data.listId}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Rediger pakkeliste" : "Ny pakkeliste"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="packing-list-name">Navn *</Label>
            <Input
              id="packing-list-name"
              placeholder="F.eks. Hyttetur i vinterferien"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Sesong</Label>
              <Select
                value={season ?? NONE}
                onValueChange={(value) =>
                  setSeason(
                    value === NONE ? null : (value as PackingSeasonValue)
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Velg" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke angitt</SelectItem>
                  {PACKING_SEASONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {SEASON_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Varighet</Label>
              <Select
                value={duration ?? NONE}
                onValueChange={(value) =>
                  setDuration(
                    value === NONE ? null : (value as PackingDurationValue)
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Velg" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke angitt</SelectItem>
                  {PACKING_DURATIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {DURATION_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="packing-list-abroad">Utenlandsreise</Label>
            <Switch
              id="packing-list-abroad"
              checked={abroad}
              onCheckedChange={setAbroad}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="packing-list-departure">Avreise</Label>
            <Input
              id="packing-list-departure"
              type="date"
              value={departureOn}
              onChange={(e) => setDepartureOn(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="packing-list-notes">Notater</Label>
            <Textarea
              id="packing-list-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {!isEdit && bundles.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Pakker</legend>
              <p className="text-xs text-muted-foreground">
                Tingene i pakkene du velger, legges inn i listen.
              </p>
              <ul className="flex flex-col gap-1">
                {options.map(({ bundle, fits }) => {
                  const id = `bundle-${bundle.id}`
                  return (
                    <li key={bundle.id}>
                      <label
                        htmlFor={id}
                        className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/50"
                      >
                        <Checkbox
                          id={id}
                          className="mt-0.5"
                          checked={isChecked(bundle, fits)}
                          onCheckedChange={(checked) =>
                            setOverrides((previous) =>
                              new Map(previous).set(bundle.id, checked === true)
                            )
                          }
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                            <span className="break-words">{bundle.name}</span>
                            {fits && (
                              <Badge variant="secondary" className="text-xs">
                                Passer
                              </Badge>
                            )}
                            {bundle.autoAdd && fits && (
                              <Badge variant="outline" className="text-xs">
                                Legges til automatisk
                              </Badge>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {bundle.items.length} ting ·{" "}
                            {describeBundleConditions(bundle)}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          )}

          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isEdit ? "Lagre endringer" : "Opprett pakkeliste"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The "Ny pakkeliste" button. The trigger is created here, in the client:
 * a server-rendered element passed through a large payload can arrive as a
 * lazy reference, which Radix's `asChild` silently renders as nothing.
 */
export function NewPackingListButton({ bundles }: { bundles: BundleOption[] }) {
  return (
    <PackingListFormDialog
      bundles={bundles}
      trigger={
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Ny pakkeliste
        </Button>
      }
    />
  )
}
