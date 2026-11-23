"use client"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { CalendarEventRecurrence, CalendarEventType } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { Loader2, Save } from "lucide-react"

import { createEvent, updateEvent } from "@/lib/actions/event"
import { daysInMonth } from "@/lib/application/events/dates"
import {
  EVENT_RECURRENCE_LABELS,
  EVENT_TYPE_CONFIG,
  EVENT_TYPES,
  MONTH_NAMES,
} from "@/lib/event-labels"

export type EditableEvent = {
  id: string
  title: string
  type: CalendarEventType
  recurrence: CalendarEventRecurrence
  month: number
  day: number
  year: number | null
  notes: string | null
}

const YEAR_LABELS: Record<CalendarEventType, string> = {
  BIRTHDAY: "Fødselsår",
  ANNIVERSARY: "Fra år",
  HOLIDAY: "År",
  OTHER: "År",
}

export function EventFormDialog({
  event,
  defaultMonth,
  trigger,
}: {
  event?: EditableEvent
  /** Month preselected for a new event, e.g. the one shown in the calendar. */
  defaultMonth?: number
  trigger: ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(event?.title ?? "")
  const [type, setType] = useState<CalendarEventType>(event?.type ?? "BIRTHDAY")
  const [recurrence, setRecurrence] = useState<CalendarEventRecurrence>(
    event?.recurrence ?? "YEARLY"
  )
  const [month, setMonth] = useState(event?.month ?? defaultMonth ?? 1)
  const [day, setDay] = useState(event?.day ?? 1)
  const [year, setYear] = useState(event?.year ? String(event.year) : "")
  const [notes, setNotes] = useState(event?.notes ?? "")
  const [error, setError] = useState("")

  // 29 February is allowed: a yearly birthday then falls on 28 February.
  const dayCount = daysInMonth(2000, month)
  const yearRequired = recurrence === "NONE"

  function reset() {
    setTitle("")
    setType("BIRTHDAY")
    setRecurrence("YEARLY")
    setMonth(defaultMonth ?? 1)
    setDay(1)
    setYear("")
    setNotes("")
  }

  function handleSubmit() {
    if (!title.trim()) {
      setError("Navn er påkrevd")
      return
    }
    const parsedYear = year.trim() ? Number(year) : null
    if (parsedYear !== null && !Number.isInteger(parsedYear)) {
      setError("Året må være et helt tall")
      return
    }
    if (yearRequired && parsedYear === null) {
      setError("En hendelse som ikke gjentas må ha et år")
      return
    }
    setError("")

    startTransition(async () => {
      const fields = {
        title: title.trim(),
        type,
        recurrence,
        month,
        day: Math.min(day, dayCount),
        year: parsedYear,
        notes: notes.trim() || null,
      }
      const result = event
        ? await updateEvent({ id: event.id, ...fields })
        : await createEvent(fields)

      if (!result.ok) {
        setError(result.error)
        return
      }
      if (!event) reset()
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {event ? "Rediger hendelse" : "Ny hendelse"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as CalendarEventType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {EVENT_TYPE_CONFIG[option].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Gjentas</Label>
              <Select
                value={recurrence}
                onValueChange={(value) =>
                  setRecurrence(value as CalendarEventRecurrence)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["YEARLY", "NONE"] as const).map((option) => (
                    <SelectItem key={option} value={option}>
                      {EVENT_RECURRENCE_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-title">
              {type === "BIRTHDAY" ? "Navn *" : "Tittel *"}
            </Label>
            <Input
              id="event-title"
              placeholder={
                type === "BIRTHDAY" ? "F.eks. Mormor" : "F.eks. Bryllupsdag"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[5rem_1fr_6rem] gap-3">
            <div className="flex flex-col gap-2">
              <Label>Dag</Label>
              <Select
                value={String(Math.min(day, dayCount))}
                onValueChange={(value) => setDay(Number(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: dayCount }, (_, i) => i + 1).map(
                    (option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}.
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Måned</Label>
              <Select
                value={String(month)}
                onValueChange={(value) => setMonth(Number(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, index) => (
                    <SelectItem key={name} value={String(index + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-year">
                {YEAR_LABELS[type]}
                {yearRequired ? " *" : ""}
              </Label>
              <Input
                id="event-year"
                inputMode="numeric"
                placeholder={yearRequired ? "2027" : "Valgfritt"}
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
                maxLength={4}
              />
            </div>
          </div>
          {type === "BIRTHDAY" && recurrence === "YEARLY" && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Med fødselsår vises hvor gammel personen fyller.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-notes">Notater</Label>
            <Textarea
              id="event-notes"
              placeholder="Størrelser, interesser, hva som er gitt før …"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {event ? "Lagre endringer" : "Opprett hendelse"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
