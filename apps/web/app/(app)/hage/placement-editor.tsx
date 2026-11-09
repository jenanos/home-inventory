"use client"

import { useState, useTransition } from "react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Loader2, Plus } from "lucide-react"
import { createGardenBed } from "@/lib/actions/plant"

export type BedOption = { id: string; name: string }

/** Selected beds, keyed by bed id, with the quantity as typed. */
export type PlacementDraft = Map<string, { quantity: string }>

export function placementDraftFrom(
  placements: Array<{ bedId: string; quantity: number | null }>
): PlacementDraft {
  return new Map(
    placements.map((placement) => [
      placement.bedId,
      { quantity: placement.quantity?.toString() ?? "" },
    ])
  )
}

export function placementsFromDraft(draft: PlacementDraft) {
  return [...draft].map(([bedId, { quantity }]) => {
    const parsed = Number.parseInt(quantity, 10)
    return {
      bedId,
      quantity: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
    }
  })
}

export function PlacementEditor({
  beds: initialBeds,
  value,
  onChange,
}: {
  beds: BedOption[]
  value: PlacementDraft
  onChange: (next: PlacementDraft) => void
}) {
  const [beds, setBeds] = useState(initialBeds)
  const [newBedName, setNewBedName] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function toggle(bedId: string, checked: boolean) {
    const next = new Map(value)
    if (checked) next.set(bedId, { quantity: "" })
    else next.delete(bedId)
    onChange(next)
  }

  function setQuantity(bedId: string, quantity: string) {
    const next = new Map(value)
    next.set(bedId, { quantity })
    onChange(next)
  }

  function addBed() {
    const name = newBedName.trim()
    if (!name) return
    const existing = beds.find(
      (bed) => bed.name.toLowerCase() === name.toLowerCase()
    )
    if (existing) {
      toggle(existing.id, true)
      setNewBedName("")
      return
    }

    setError("")
    startTransition(async () => {
      try {
        const bed = await createGardenBed({ name })
        setBeds((current) =>
          [...current, { id: bed.id, name: bed.name }].sort((a, b) =>
            a.name.localeCompare(b.name, "nb")
          )
        )
        toggle(bed.id, true)
        setNewBedName("")
      } catch {
        setError("Kunne ikke opprette bedet")
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Plassering</Label>
      {beds.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Ingen bed ennå. Opprett det første under.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-md border p-2">
          {beds.map((bed) => {
            const selected = value.get(bed.id)
            const id = `bed-${bed.id}`
            return (
              <div key={bed.id} className="flex min-h-9 items-center gap-2">
                <Checkbox
                  id={id}
                  checked={Boolean(selected)}
                  onCheckedChange={(checked) =>
                    toggle(bed.id, checked === true)
                  }
                />
                <Label htmlFor={id} className="flex-1 font-normal">
                  {bed.name}
                </Label>
                {selected && (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    placeholder="Antall"
                    aria-label={`Antall i ${bed.name}`}
                    className="h-8 w-24"
                    value={selected.quantity}
                    onChange={(e) => setQuantity(bed.id, e.target.value)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Nytt bed, f.eks. Bed ved inngangen"
          value={newBedName}
          onChange={(e) => setNewBedName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addBed()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={addBed}
          disabled={isPending || !newBedName.trim()}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Legg til
        </Button>
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}
