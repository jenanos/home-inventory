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
import { cn } from "@workspace/ui/lib/utils"
import { Loader2, Plus, Save, X } from "lucide-react"
import type {
  PackingDurationValue,
  PackingSeasonValue,
} from "@/lib/application/packing/rules"
import { createPackingBundle, updatePackingBundle } from "@/lib/actions/packing"
import {
  DURATION_SHORT_LABELS,
  PACKING_DURATIONS,
  PACKING_SEASONS,
  SEASON_LABELS,
} from "@/lib/packing-labels"

export type EditableBundle = {
  id: string
  name: string
  description: string | null
  seasons: PackingSeasonValue[]
  durations: PackingDurationValue[]
  abroadOnly: boolean
  autoAdd: boolean
  items: Array<{
    id: string
    name: string
    quantity: number
    notes: string | null
  }>
}

type ItemDraft = {
  key: string
  name: string
  quantity: string
  notes: string | null
}

let draftCounter = 0
function newDraft(name = "", quantity = "1", notes: string | null = null) {
  draftCounter += 1
  return { key: `draft-${draftCounter}`, name, quantity, notes }
}

function draftsFrom(bundle: EditableBundle | undefined): ItemDraft[] {
  return (bundle?.items ?? []).map((item) => ({
    key: item.id,
    name: item.name,
    quantity: String(item.quantity),
    notes: item.notes,
  }))
}

function toggle<T>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value]
}

export function BundleFormDialog({
  bundle,
  trigger,
}: {
  bundle?: EditableBundle
  trigger: ReactNode
}) {
  const router = useRouter()
  const isEdit = Boolean(bundle)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(bundle?.name ?? "")
  const [description, setDescription] = useState(bundle?.description ?? "")
  const [seasons, setSeasons] = useState(bundle?.seasons ?? [])
  const [durations, setDurations] = useState(bundle?.durations ?? [])
  const [abroadOnly, setAbroadOnly] = useState(bundle?.abroadOnly ?? false)
  const [autoAdd, setAutoAdd] = useState(bundle?.autoAdd ?? false)
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
      setItems(draftsFrom(bundle))
      setError("")
    }
    setOpen(next)
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
    const invalid = filled.find((item) => {
      const count = Number(item.quantity)
      return !Number.isInteger(count) || count < 1
    })
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
      items: filled.map((item) => ({
        name: item.name.trim(),
        quantity: Number(item.quantity),
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
        setItems([])
      }
      setNewItem("")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
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
                  <li key={item.key} className="flex items-center gap-2">
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
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Endringer gjelder nye pakkelister. Lister pakken alt er lagt til
                i, beholder tingene de har.
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
