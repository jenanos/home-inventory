"use client"

import { useState, useTransition } from "react"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { upsertBudgetTrip } from "@/lib/actions/budget"
import {
  tripCostPerTrip,
  tripMonthlyCost,
} from "@/lib/application/budget/calculations"
import { toast } from "sonner"
import type { TripTransportType } from "@workspace/db"
import type { BudgetTripData } from "./budget-view"
import { BudgetFormSheet, FormActions } from "./budget-form-sheet"
import {
  formatCurrency,
  optionalString,
  parseOptionalNumber,
} from "./budget-format"
import { MoreDetails } from "./more-details"

interface TripDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trip: BudgetTripData | null
}

export function TripDialog({ open, onOpenChange, trip }: TripDialogProps) {
  return (
    <BudgetFormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={trip ? "Rediger reise" : "Legg til reise"}
    >
      {open ? (
        <TripForm
          key={trip?.id ?? "new"}
          trip={trip}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </BudgetFormSheet>
  )
}

const costText = (value: number | null) =>
  value != null && value > 0 ? String(value) : ""

function CostInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function TripForm({
  trip,
  onOpenChange,
}: {
  trip: BudgetTripData | null
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState(trip?.name ?? "")
  const [transportType, setTransportType] = useState<TripTransportType>(
    trip?.transportType ?? "AIR_OR_PUBLIC"
  )
  const [annualTrips, setAnnualTrips] = useState(String(trip?.annualTrips ?? 1))
  const [ticketPerTrip, setTicketPerTrip] = useState(
    costText(trip?.ticketPerTrip ?? null)
  )
  const [tollPerTrip, setTollPerTrip] = useState(
    costText(trip?.tollPerTrip ?? null)
  )
  const [ferryPerTrip, setFerryPerTrip] = useState(
    costText(trip?.ferryPerTrip ?? null)
  )
  const [fuelPerTrip, setFuelPerTrip] = useState(
    costText(trip?.fuelPerTrip ?? null)
  )
  const [otherPerTrip, setOtherPerTrip] = useState(
    trip?.otherPerTrip != null ? String(trip.otherPerTrip) : ""
  )
  const [notes, setNotes] = useState(trip?.notes ?? "")
  const [isPending, startTransition] = useTransition()

  const costs = {
    transportType,
    annualTrips: Math.max(1, Math.round(Number(annualTrips) || 1)),
    ticketPerTrip: parseOptionalNumber(ticketPerTrip) ?? 0,
    tollPerTrip: parseOptionalNumber(tollPerTrip) ?? 0,
    ferryPerTrip: parseOptionalNumber(ferryPerTrip) ?? 0,
    fuelPerTrip: parseOptionalNumber(fuelPerTrip) ?? 0,
    otherPerTrip: parseOptionalNumber(otherPerTrip),
  }
  const filledCount = [otherPerTrip, notes].filter(
    (v) => v.trim() !== ""
  ).length

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const annualTripsNumber = Math.round(Number(annualTrips) || 0)

    if (!name.trim() || annualTripsNumber <= 0) {
      toast.error("Fyll inn navn og antall reiser per år")
      return
    }
    if (tripCostPerTrip(costs) <= 0) {
      toast.error("Legg inn minst én kostnad per reise")
      return
    }

    startTransition(async () => {
      try {
        await upsertBudgetTrip({
          id: trip?.id,
          name: name.trim(),
          ...costs,
          annualTrips: annualTripsNumber,
          notes: optionalString(notes),
        })
        toast.success(trip ? "Reise oppdatert" : "Reise lagt til")
        onOpenChange(false)
      } catch {
        toast.error("Noe gikk galt")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="trip-name">Navn på reise</Label>
        <Input
          id="trip-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="F.eks. Sommerferie til Vestlandet"
        />
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="trip-type">Transport</Label>
          <Select
            value={transportType}
            onValueChange={(v) => setTransportType(v as TripTransportType)}
          >
            <SelectTrigger id="trip-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AIR_OR_PUBLIC">
                Fly / offentlig transport
              </SelectItem>
              <SelectItem value="CAR">Bil</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="trip-annual">Antall reiser per år</Label>
          <Input
            id="trip-annual"
            type="number"
            min="1"
            step="1"
            value={annualTrips}
            onChange={(e) => setAnnualTrips(e.target.value)}
          />
        </div>
      </div>

      {transportType === "AIR_OR_PUBLIC" ? (
        <CostInput
          id="trip-ticket"
          label="Billettkostnad per reise (kr)"
          value={ticketPerTrip}
          onChange={setTicketPerTrip}
          placeholder="F.eks. 3500"
        />
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <CostInput
            id="trip-toll"
            label="Bom per reise (kr)"
            value={tollPerTrip}
            onChange={setTollPerTrip}
          />
          <CostInput
            id="trip-ferry"
            label="Ferge per reise (kr)"
            value={ferryPerTrip}
            onChange={setFerryPerTrip}
          />
          <CostInput
            id="trip-fuel"
            label="Lading / drivstoff per reise (kr)"
            value={fuelPerTrip}
            onChange={setFuelPerTrip}
            className="sm:col-span-2"
          />
        </div>
      )}

      <MoreDetails filledCount={filledCount}>
        <CostInput
          id="trip-other"
          label="Andre kostnader per reise (kr)"
          value={otherPerTrip}
          onChange={setOtherPerTrip}
          placeholder="Parkering, overnatting o.l."
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="trip-notes">Notat</Label>
          <Textarea
            id="trip-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </MoreDetails>

      <div className="rounded-md bg-muted p-3 text-sm">
        Månedlig kostnad fra årlig reiseforbruk:{" "}
        <span className="font-bold">
          {formatCurrency(tripMonthlyCost(costs))}
        </span>
      </div>

      <FormActions
        onCancel={() => onOpenChange(false)}
        isPending={isPending}
        submitLabel={trip ? "Lagre" : "Legg til"}
      />
    </form>
  )
}
