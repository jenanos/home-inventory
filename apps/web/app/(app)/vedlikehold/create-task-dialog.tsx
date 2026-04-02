"use client"

import { useState, useTransition } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/drawer"
import { Button } from "@workspace/ui/components/button"
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Calendar } from "@workspace/ui/components/calendar"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"
import { Plus, Loader2, CalendarIcon } from "lucide-react"
import { createMaintenanceTask } from "@/lib/actions/maintenance-task"
import type { Priority } from "@workspace/db"
import { useMediaQuery } from "@/hooks/use-media-query"

export function CreateTaskDialog() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<Priority>("MEDIUM")
  const [estimatedDuration, setEstimatedDuration] = useState("")
  const [estimatedPrice, setEstimatedPrice] = useState("")
  const [dueDate, setDueDate] = useState<Date | undefined>()
  const [error, setError] = useState("")

  function resetForm() {
    setTitle("")
    setDescription("")
    setPriority("MEDIUM")
    setEstimatedDuration("")
    setEstimatedPrice("")
    setDueDate(undefined)
    setError("")
  }

  function handleSubmit() {
    if (!title.trim()) {
      setError("Tittel er påkrevd")
      return
    }

    startTransition(async () => {
      try {
        await createMaintenanceTask({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          estimatedDuration: estimatedDuration.trim() || undefined,
          estimatedPrice: estimatedPrice ? parseFloat(estimatedPrice) : undefined,
          dueDate: dueDate || undefined,
        })
        resetForm()
        setOpen(false)
      } catch {
        setError("Kunne ikke opprette oppgave")
      }
    })
  }

  const formContent = (
    <div className="flex flex-col gap-4 px-1">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Tittel *</Label>
        <Input
          id="title"
          placeholder="F.eks. Utbedre drenering"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Beskrivelse</Label>
        <Textarea
          id="description"
          placeholder="Beskriv oppgaven..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Prioritet</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HIGH">Høy</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Lav</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="duration">Antatt varighet</Label>
          <Input
            id="duration"
            placeholder="F.eks. 2 dager"
            value={estimatedDuration}
            onChange={(e) => setEstimatedDuration(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="price">Estimert pris (NOK)</Label>
          <Input
            id="price"
            type="number"
            placeholder="0"
            value={estimatedPrice}
            onChange={(e) => setEstimatedPrice(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Forfallsdato</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-left font-normal",
                  !dueDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dueDate
                  ? dueDate.toLocaleDateString("nb-NO")
                  : "Velg dato"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dueDate}
                onSelect={setDueDate}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Button onClick={handleSubmit} disabled={isPending} className="mt-2">
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Plus className="mr-2 h-4 w-4" />
        )}
        Opprett oppgave
      </Button>
    </div>
  )

  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Ny oppgave
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Ny vedlikeholdsoppgave</SheetTitle>
          </SheetHeader>
          {formContent}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Ny oppgave
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Ny vedlikeholdsoppgave</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">{formContent}</div>
      </DrawerContent>
    </Drawer>
  )
}
