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
import { cn } from "@workspace/ui/lib/utils"
import { Loader2, Plus, Save } from "lucide-react"
import { toast } from "sonner"
import {
  bundleFitsTrip,
  type BundleConditions,
  type PackingDurationValue,
  type PackingSeasonValue,
} from "@/lib/application/packing/rules"
import {
  createPackingList,
  duplicatePackingList,
  updatePackingList,
} from "@/lib/actions/packing"
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
  /** Whose bundle it is; its things go to them. */
  personName: string | null
  items: Array<{ id: string }>
}

/** A template a new trip can start from. */
export type TemplateOption = {
  id: string
  name: string
  season: PackingSeasonValue | null
  duration: PackingDurationValue | null
  abroad: boolean
  itemCount: number
}

type NewKind = "TRIP" | "TEMPLATE"

export type EditableList = {
  id: string
  name: string
  kind: "TEMPLATE" | "TRIP" | "ARCHIVED"
  season: PackingSeasonValue | null
  duration: PackingDurationValue | null
  abroad: boolean
  departureOn: Date | null
  notes: string | null
}

/**
 * Creates a trip or a template, with a bundle picker or from a template, or
 * edits an existing list's trip details. Bundles are passed explicitly, so
 * what is checked here is exactly what gets added. A trip started from a
 * template gets the template's things, with the numbers for its own length.
 */
export function PackingListFormDialog({
  list,
  bundles = [],
  templates = [],
  kind: initialKind = "TRIP",
  fromTemplateId,
  trigger,
  defaultOpen = false,
  onClose,
}: {
  list?: EditableList
  bundles?: BundleOption[]
  templates?: TemplateOption[]
  kind?: NewKind
  /** Start with this template chosen ("Start tur fra malen"). */
  fromTemplateId?: string
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
  const isEdit = Boolean(list)
  const [open, setOpen] = useState(defaultOpen)

  function close() {
    setOpen(false)
    onClose?.()
  }
  const [isPending, startTransition] = useTransition()
  const [kind, setKind] = useState<NewKind>(initialKind)
  const [templateId, setTemplateId] = useState<string>(fromTemplateId ?? NONE)
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

  const template =
    kind === "TRIP"
      ? templates.find((option) => option.id === templateId)
      : undefined
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
    setKind(initialKind)
    setTemplateId(fromTemplateId ?? NONE)
    setName("")
    setSeason(null)
    setDuration(null)
    setAbroad(false)
    setDepartureOn("")
    setNotes("")
    setOverrides(new Map())
  }

  /** A chosen template fills in its trip details; they can then be changed. */
  function chooseTemplate(id: string) {
    setTemplateId(id)
    const chosen = templates.find((option) => option.id === id)
    if (!chosen) return
    setSeason(chosen.season)
    setDuration(chosen.duration)
    setAbroad(chosen.abroad)
  }

  function handleOpenChange(next: boolean) {
    if (next && !list && fromTemplateId) chooseTemplate(fromTemplateId)
    setOpen(next)
    if (!next) onClose?.()
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
        close()
        router.refresh()
        return
      }

      if (template) {
        const copy = await duplicatePackingList({
          listId: template.id,
          kind: "TRIP",
          name: fields.name,
          season,
          duration,
          abroad,
          departureOn: fields.departureOn,
        })
        if (!copy.ok) {
          setError(copy.error)
          return
        }
        reset()
        close()
        router.push(`/pakkelister/${copy.data.id}`)
        return
      }

      const result = await createPackingList({
        ...fields,
        kind,
        departureOn: kind === "TEMPLATE" ? null : fields.departureOn,
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
      close()
      router.push(`/pakkelister/${result.data.listId}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Rediger pakkeliste"
              : template
                ? "Start tur fra mal"
                : kind === "TEMPLATE"
                  ? "Ny mal"
                  : "Ny tur"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          {!isEdit && !fromTemplateId && (
            <div
              role="radiogroup"
              aria-label="Type"
              className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
            >
              {(["TRIP", "TEMPLATE"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  onClick={() => setKind(value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    kind === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {value === "TRIP" ? "Tur" : "Mal"}
                </button>
              ))}
            </div>
          )}
          {!isEdit && kind === "TRIP" && templates.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Start fra</Label>
              <Select value={templateId} onValueChange={chooseTemplate}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Tom liste med pakker</SelectItem>
                  {templates.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      Mal: {option.name} ({option.itemCount} ting)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {template && (
                <p className="text-xs text-muted-foreground">
                  Tingene i malen kopieres inn. Antall fra pakkene følger
                  varigheten du velger her.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="packing-list-name">Navn *</Label>
            <Input
              id="packing-list-name"
              placeholder={
                kind === "TEMPLATE"
                  ? "F.eks. Hytta vinter"
                  : "F.eks. Hyttetur i vinterferien"
              }
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
          {/* A template is not a trip, so it has no departure. */}
          {(list ? list.kind !== "TEMPLATE" : kind === "TRIP") && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="packing-list-departure">Avreise</Label>
              <Input
                id="packing-list-departure"
                type="date"
                value={departureOn}
                onChange={(e) => setDepartureOn(e.target.value)}
              />
            </div>
          )}
          {!template && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="packing-list-notes">Notater</Label>
              <Textarea
                id="packing-list-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {!isEdit && !template && bundles.length > 0 && (
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
                            {bundle.personName
                              ? ` · til ${bundle.personName}`
                              : ""}
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
            {isEdit
              ? "Lagre endringer"
              : template
                ? "Start tur"
                : kind === "TEMPLATE"
                  ? "Opprett mal"
                  : "Opprett tur"}
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
export function NewPackingListButton({
  bundles,
  templates,
  kind,
}: {
  bundles: BundleOption[]
  templates: TemplateOption[]
  kind: NewKind
}) {
  return (
    <PackingListFormDialog
      // A new tab starts a new form with that tab's kind.
      key={kind}
      bundles={bundles}
      templates={templates}
      kind={kind}
      trigger={
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {kind === "TEMPLATE" ? "Ny mal" : "Ny tur"}
        </Button>
      }
    />
  )
}

/** "Start tur" on a template's page: the form with the template chosen. */
export function StartTripButton({
  template,
  variant = "default",
}: {
  template: TemplateOption
  variant?: "default" | "outline"
}) {
  return (
    <PackingListFormDialog
      templates={[template]}
      fromTemplateId={template.id}
      trigger={
        <Button variant={variant} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Start tur fra malen
        </Button>
      }
    />
  )
}
