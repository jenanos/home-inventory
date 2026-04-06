"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { toast } from "sonner"
import type { TripTransportType } from "@workspace/db"
import { upsertBudgetTrip } from "@/lib/actions/budget"
import type { BudgetTripData } from "./budget-view"

interface TripDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trip: BudgetTripData | null
}

export function TripDialog({ open, onOpenChange, trip }: TripDialogProps) {
  const [name, setName] = useState("")
  const [transportType, setTransportType] = useState<TripTransportType>("AIR_OR_PUBLIC")
  const [annualTrips, setAnnualTrips] = useState("1")
  const [ticketPerTrip, setTicketPerTrip] = useState("")
  const [tollPerTrip, setTollPerTrip] = useState("")
  const [ferryPerTrip, setFerryPerTrip] = useState("")
  const [fuelPerTrip, setFuelPerTrip] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return

    if (trip) {
      setName(trip.name)
      setTransportType(trip.transportType)
      setAnnualTrips(String(trip.annualTrips))
      setTicketPerTrip(String(trip.ticketPerTrip || ""))
      setTollPerTrip(String(trip.tollPerTrip || ""))
      setFerryPerTrip(String(trip.ferryPerTrip || ""))
      setFuelPerTrip(String(trip.fuelPerTrip || ""))
      return
    }

    setName("")
    setTransportType("AIR_OR_PUBLIC")
    setAnnualTrips("1")
    setTicketPerTrip("")
    setTollPerTrip("")
    setFerryPerTrip("")
    setFuelPerTrip("")
  }, [open, trip])

  const monthlyPreview = useMemo(() => {
    const trips = Math.max(1, Number(annualTrips) || 1)
    if (transportType === "AIR_OR_PUBLIC") {
      return (trips * (Number(ticketPerTrip) || 0)) / 12
    }

    const carPerTrip =
      (Number(tollPerTrip) || 0) +
      (Number(ferryPerTrip) || 0) +
      (Number(fuelPerTrip) || 0)

    return (trips * carPerTrip) / 12
  }, [annualTrips, transportType, ticketPerTrip, tollPerTrip, ferryPerTrip, fuelPerTrip])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const annualTripsNumber = Math.round(Number(annualTrips) || 0)

    if (!name.trim() || annualTripsNumber <= 0) {
      toast.error("Fyll inn navn og antall reiser per år")
      return
    }

    if (transportType === "AIR_OR_PUBLIC" && (Number(ticketPerTrip) || 0) <= 0) {
      toast.error("Legg inn billettkostnad per reise")
      return
    }

    if (
      transportType === "CAR" &&
      (Number(tollPerTrip) || 0) + (Number(ferryPerTrip) || 0) + (Number(fuelPerTrip) || 0) <= 0
    ) {
      toast.error("Legg inn minst én kostnad for bilreise")
      return
    }

    startTransition(async () => {
      try {
        await upsertBudgetTrip({
          id: trip?.id,
          name: name.trim(),
          transportType,
          annualTrips: annualTripsNumber,
          ticketPerTrip: Number(ticketPerTrip) || 0,
          tollPerTrip: Number(tollPerTrip) || 0,
          ferryPerTrip: Number(ferryPerTrip) || 0,
          fuelPerTrip: Number(fuelPerTrip) || 0,
        })
        toast.success(trip ? "Reise oppdatert" : "Reise lagt til")
        onOpenChange(false)
      } catch {
        toast.error("Noe gikk galt")
      }
    })
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency: "NOK",
      maximumFractionDigits: 0,
    }).format(amount)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{trip ? "Rediger reise" : "Legg til reise"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="trip-name">Navn på reise</Label>
            <Input
              id="trip-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="F.eks. Sommerferie til Vestlandet"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
                  <SelectItem value="AIR_OR_PUBLIC">Fly / offentlig transport</SelectItem>
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="trip-ticket">Billettkostnad per reise (kr)</Label>
              <Input
                id="trip-ticket"
                type="number"
                min="0"
                step="1"
                value={ticketPerTrip}
                onChange={(e) => setTicketPerTrip(e.target.value)}
                placeholder="F.eks. 3500"
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="trip-toll">Bom per reise (kr)</Label>
                <Input
                  id="trip-toll"
                  type="number"
                  min="0"
                  step="1"
                  value={tollPerTrip}
                  onChange={(e) => setTollPerTrip(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="trip-ferry">Ferge per reise (kr)</Label>
                <Input
                  id="trip-ferry"
                  type="number"
                  min="0"
                  step="1"
                  value={ferryPerTrip}
                  onChange={(e) => setFerryPerTrip(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="trip-fuel">Lading / drivstoff per reise (kr)</Label>
                <Input
                  id="trip-fuel"
                  type="number"
                  min="0"
                  step="1"
                  value={fuelPerTrip}
                  onChange={(e) => setFuelPerTrip(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="bg-muted rounded-md p-3 text-sm">
            Månedlig kostnad fra årlig reiseforbruk: <span className="font-bold">{formatCurrency(monthlyPreview)}</span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={isPending}>
              {trip ? "Lagre" : "Legg til"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
