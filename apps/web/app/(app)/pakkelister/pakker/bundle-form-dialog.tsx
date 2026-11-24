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
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import { Clock, Loader2, Plus, Save, X } from "lucide-react"
import { toast } from "sonner"
import type {
  PackingDurationValue,
  PackingSeasonValue,
} from "@/lib/application/packing/rules"
import {
  createPackingBundle,
  syncBundleToTemplates,
  updatePackingBundle,
} from "@/lib/actions/packing"
import type { PackingPersonOption } from "../persons-dialog"
import {
  DURATION_SHORT_LABELS,
  PACKING_DURATIONS,
  PACKING_SEASONS,
  SEASON_LABELS,
} from "@/lib/packing-labels"

const SHARED = "__shared__"

type ByDuration = Record<PackingDurationValue, string>

export type EditableBundle = {
  id: string
  name: string
  description: string | null
  seasons: PackingSeasonValue[]
  durations: PackingDurationValue[]
  abroadOnly: boolean
  autoAdd: boolean
  personId: string | null
  personName: string | null
  /** Templates with this bundle's things, which "Oppdater maler" updates. */
  templates: Array<{ id: string; name: string }>
  items: Array<{
    id: string
    name: string
    quantity: number
    quantityByDuration: Partial<Record<PackingDurationValue, number>>
    notes: string | null
  }>
}

type ItemDraft = {
  key: string
  /** The saved item's id, so a rename keeps its link to the templates. */
  id?: string
  name: string
  quantity: string
  /** Blank: use the plain quantity for that trip length. */
  byDuration: ByDuration
  showDurations: boolean
  notes: string | null
}

const EMPTY_BY_DURATION: ByDuration = {
  DAY: "",
  WEEKEND: "",
  WEEK: "",
  LONG: "",
}

let draftCounter = 0
function newDraft(name = ""): ItemDraft {
  draftCounter += 1
  return {
    key: `draft-${draftCounter}`,
    name,
    quantity: "1",
    byDuration: EMPTY_BY_DURATION,
    showDurations: false,
    notes: null,
  }
}

function draftsFrom(bundle: EditableBundle | undefined): ItemDraft[] {
  return (bundle?.items ?? []).map((item) => {
    const byDuration = { ...EMPTY_BY_DURATION }
    for (const duration of PACKING_DURATIONS) {
      const count = item.quantityByDuration[duration]
      if (count !== undefined) byDuration[duration] = String(count)
    }
    return {
      key: item.id,
      id: item.id,
      name: item.name,
      quantity: String(item.quantity),
      byDuration,
      showDurations: Object.keys(item.quantityByDuration).length > 0,
      notes: item.notes,
    }
  })
}

function isCount(value: string) {
  const count = Number(value)
  return Number.isInteger(count) && count >= 1 && count <= 999
}

/** Offers to bring the templates using the bundle up to date. */
export function offerTemplateSync(
  bundleId: string,
  templates: Array<{ id: string; name: string }>,
  onDone: () => void
) {
  if (templates.length === 0) return
  const which =
    templates.length === 1
      ? `«${templates[0]!.name}»`
      : `${templates.length} maler`
  toast(`Pakken brukes i ${which}`, {
    description: "Vil du oppdatere malene med endringene? Turer endres ikke.",
    duration: 15_000,
    action: {
      label: "Oppdater maler",
      onClick: async () => {
        const result = await syncBundleToTemplates({ bundleId })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success(describeSync(result.data.lists))
        onDone()
      },
    },
  })
}

export function describeSync(
  lists: Array<{ added: number; updated: number; removed: number }>
) {
  const sum = (key: "added" | "updated" | "removed") =>
    lists.reduce((total, list) => total + list[key], 0)
  const parts = [
    sum("added") > 0 && `${sum("added")} lagt til`,
    sum("updated") > 0 && `${sum("updated")} endret`,
    sum("removed") > 0 && `${sum("removed")} fjernet`,
  ].filter(Boolean)
  return parts.length === 0
    ? "Malene var allerede oppdatert"
    : `Oppdaterte ${lists.length === 1 ? "malen" : `${lists.length} maler`}: ${parts.join(", ")}`
}

function toggle<T>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value]
}

export function BundleFormDialog({
  bundle,
  persons = [],
  trigger,
  defaultOpen = false,
  onClose,
}: {
  bundle?: EditableBundle
  persons?: PackingPersonOption[]
  /** Omit and pass `defaultOpen` to mount the dialog already open. */
  trigger?: ReactNode
  /**
   * Open on mount. Used from a dropdown menu: a dialog nested in the menu
   * leaves the page unclickable after it closes (Radix restores
   * `pointer-events` in the wrong order), so the menu mounts it beside itself.
   */
  defaultOpen?: boolean
  onClose?: () => void
}) {
  const router = useRouter()
  const isEdit = Boolean(bundle)
  const [open, setOpen] = useState(defaultOpen)

  function close() {
    setOpen(false)
    onClose?.()
  }
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(bundle?.name ?? "")
  const [description, setDescription] = useState(bundle?.description ?? "")
  const [seasons, setSeasons] = useState(bundle?.seasons ?? [])
  const [durations, setDurations] = useState(bundle?.durations ?? [])
  const [abroadOnly, setAbroadOnly] = useState(bundle?.abroadOnly ?? false)
  const [autoAdd, setAutoAdd] = useState(bundle?.autoAdd ?? false)
  const [personId, setPersonId] = useState(bundle?.personId ?? SHARED)
  const [items, setItems] = useState<ItemDraft[]>(() => draftsFrom(bundle))
  const [newItem, setNewItem] = useState("")
  const [error, setError] = useState("")

  function handleOpenChange(next: boolean) {
    // Opening an edit starts from what is saved, not from an abandoned draft.
    if (next && bundle) {
      setName(bundle.name)
      setDescription(bundle.description ?? "")
      setSeasons(bundle.seasons)
      setDurations(bundle.durations)
      setAbroadOnly(bundle.abroadOnly)
      setAutoAdd(bundle.autoAdd)
      setPersonId(bundle.personId ?? SHARED)
      setItems(draftsFrom(bundle))
      setError("")
    }
    setOpen(next)
    if (!next) onClose?.()
  }

  function addItem() {
    const trimmed = newItem.trim()
    if (!trimmed) return
    setItems((previous) => [...previous, newDraft(trimmed)])
    setNewItem("")
  }

  function updateItem(key: string, change: Partial<ItemDraft>) {
    setItems((previous) =>
      previous.map((item) => (item.key === key ? { ...item, ...change } : item))
    )
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError("Navn er påkrevd")
      return
    }
    // A name typed but not yet added still belongs in the bundle.
    const drafts = newItem.trim() ? [...items, newDraft(newItem.trim())] : items
    const filled = drafts.filter((item) => item.name.trim())
    const invalid = filled.find(
      (item) =>
        !isCount(item.quantity) ||
        PACKING_DURATIONS.some(
          (duration) =>
            item.byDuration[duration] !== "" &&
            !isCount(item.byDuration[duration])
        )
    )
    if (invalid) {
      setError(`Antall for «${invalid.name}» må være et helt tall, minst 1`)
      return
    }
    setError("")

    const fields = {
      name: name.trim(),
      description: description.trim() || null,
      seasons,
      durations,
      abroadOnly,
      autoAdd,
      personId: personId === SHARED ? null : personId,
      items: filled.map((item) => ({
        id: item.id,
        name: item.name.trim(),
        quantity: Number(item.quantity),
        quantityByDuration: Object.fromEntries(
          PACKING_DURATIONS.map((duration) => [
            duration,
            item.byDuration[duration] === ""
              ? null
              : Number(item.byDuration[duration]),
          ])
        ),
        notes: item.notes,
      })),
    }

    startTransition(async () => {
      const result = bundle
        ? await updatePackingBundle({ id: bundle.id, ...fields })
        : await createPackingBundle(fields)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (!bundle) {
        setName("")
        setDescription("")
        setSeasons([])
        setDurations([])
        setAbroadOnly(false)
        setAutoAdd(false)
        setPersonId(SHARED)
        setItems([])
      }
      setNewItem("")
      close()
      router.refresh()
      if (bundle) {
        offerTemplateSync(bundle.id, bundle.templates, () => router.refresh())
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Rediger pakke" : "Ny pakke"}</DialogTitle>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="bundle-name">Navn *</Label>
            <Input
              id="bundle-name"
              placeholder="F.eks. Treningstøy"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bundle-description">Beskrivelse</Label>
            <Input
              id="bundle-description"
              placeholder="Hva pakken er til"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <ToggleGroup
            label="Sesong"
            hint="Ingen valgt betyr alle sesonger."
            options={PACKING_SEASONS.map((value) => ({
              value,
              label: SEASON_LABELS[value],
            }))}
            selected={seasons}
            onToggle={(value) =>
              setSeasons((previous) => toggle(previous, value))
            }
          />
          <ToggleGroup
            label="Varighet"
            hint="Ingen valgt betyr alle turer."
            options={PACKING_DURATIONS.map((value) => ({
              value,
              label: DURATION_SHORT_LABELS[value],
            }))}
            selected={durations}
            onToggle={(value) =>
              setDurations((previous) => toggle(previous, value))
            }
          />

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="bundle-abroad" className="font-normal">
              Bare utenlandsreiser
            </Label>
            <Switch
              id="bundle-abroad"
              checked={abroadOnly}
              onCheckedChange={setAbroadOnly}
            />
          </div>
          {persons.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Hvem er pakken til?</Label>
              <Select value={personId} onValueChange={setPersonId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SHARED}>Ingen bestemt person</SelectItem>
                  {persons.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Med en person, f.eks. Astrid for «Astrids toalettsaker», går
                tingene til henne når pakken legges på en liste.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="bundle-auto" className="font-normal">
              Legg til automatisk på nye lister som passer
            </Label>
            <Switch
              id="bundle-auto"
              checked={autoAdd}
              onCheckedChange={setAutoAdd}
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">
              Ting ({items.length})
            </legend>
            {items.length > 0 && (
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.key} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label="Navn"
                        className="min-w-0 flex-1"
                        value={item.name}
                        onChange={(e) =>
                          updateItem(item.key, { name: e.target.value })
                        }
                      />
                      <Input
                        aria-label={`Antall ${item.name}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={999}
                        className="w-16 shrink-0"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.key, { quantity: e.target.value })
                        }
                      />
                      <Button
                        type="button"
                        variant={item.showDurations ? "secondary" : "ghost"}
                        size="icon-sm"
                        className="shrink-0"
                        aria-label={`Antall etter varighet for ${item.name}`}
                        aria-expanded={item.showDurations}
                        onClick={() =>
                          updateItem(item.key, {
                            showDurations: !item.showDurations,
                          })
                        }
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        aria-label={`Fjern ${item.name}`}
                        onClick={() =>
                          setItems((previous) =>
                            previous.filter((entry) => entry.key !== item.key)
                          )
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {item.showDurations && (
                      <DurationQuantities
                        item={item}
                        onChange={(byDuration) =>
                          updateItem(item.key, { byDuration })
                        }
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                aria-label="Legg til ting"
                placeholder="Legg til ting, f.eks. Joggesko"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addItem()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                aria-label="Legg til"
                onClick={addItem}
                disabled={!newItem.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <Clock className="mr-1 inline h-3 w-3 align-[-2px]" />
              gir eget antall per varighet, f.eks. 3 boksere til helg og 7 til
              en uke.
            </p>
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Endringer gjelder nye pakkelister. Turer pakken alt er lagt til
                i, beholder tingene de har; maler kan du oppdatere etterpå.
              </p>
            )}
          </fieldset>

          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isEdit ? "Lagre endringer" : "Opprett pakke"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Dag · Helg · Uke · Lang: own numbers, blank for the plain quantity. */
function DurationQuantities({
  item,
  onChange,
}: {
  item: ItemDraft
  onChange: (byDuration: ByDuration) => void
}) {
  return (
    <div className="grid grid-cols-4 gap-2 rounded-md bg-muted/50 p-2">
      {PACKING_DURATIONS.map((duration) => {
        const id = `${item.key}-${duration}`
        return (
          <div key={duration} className="flex min-w-0 flex-col gap-1">
            <Label htmlFor={id} className="text-xs font-normal">
              {DURATION_SHORT_LABELS[duration]}
            </Label>
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              className="h-8"
              placeholder={item.quantity}
              value={item.byDuration[duration]}
              onChange={(e) =>
                onChange({ ...item.byDuration, [duration]: e.target.value })
              }
            />
          </div>
        )
      })}
    </div>
  )
}

function ToggleGroup<T extends string>({
  label,
  hint,
  options,
  selected,
  onToggle,
}: {
  label: string
  hint: string
  options: Array<{ value: T; label: string }>
  selected: T[]
  onToggle: (value: T) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(option.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </fieldset>
  )
}
