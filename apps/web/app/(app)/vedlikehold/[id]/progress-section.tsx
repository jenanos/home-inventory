"use client"

import { useState, useTransition } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Card } from "@workspace/ui/components/card"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Calendar } from "@workspace/ui/components/calendar"
import { cn } from "@workspace/ui/lib/utils"
import {
  ListChecks,
  Plus,
  Loader2,
  CalendarIcon,
  Trash2,
  Pencil,
} from "lucide-react"
import {
  createProgressEntry,
  updateProgressEntry,
  deleteProgressEntry,
} from "@/lib/actions/maintenance-task"

interface ProgressEntry {
  id: string
  title: string
  description: string | null
  dueDate: string | null
  completed: boolean
  completedAt: string | null
  sortOrder: number
  taskId: string
}

interface ProgressSectionProps {
  taskId: string
  entries: ProgressEntry[]
}

export function ProgressSection({ taskId, entries }: ProgressSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [addOpen, setAddOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<ProgressEntry | null>(null)

  // Add form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [dueDate, setDueDate] = useState<Date | undefined>()

  // Edit form state
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editDueDate, setEditDueDate] = useState<Date | undefined>()

  function resetAddForm() {
    setTitle("")
    setDescription("")
    setDueDate(undefined)
  }

  function openEditForm(entry: ProgressEntry) {
    setEditingEntry(entry)
    setEditTitle(entry.title)
    setEditDescription(entry.description ?? "")
    setEditDueDate(entry.dueDate ? new Date(entry.dueDate) : undefined)
  }

  function handleAdd() {
    if (!title.trim()) return
    startTransition(async () => {
      const nextSortOrder =
        Math.max(...entries.map((entry) => entry.sortOrder), -1) + 1

      await createProgressEntry({
        taskId,
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: dueDate || undefined,
        sortOrder: nextSortOrder,
      })
      resetAddForm()
      setAddOpen(false)
    })
  }

  function handleUpdate() {
    if (!editingEntry || !editTitle.trim()) return
    startTransition(async () => {
      await updateProgressEntry({
        id: editingEntry.id,
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        dueDate: editDueDate || null,
      })
      setEditingEntry(null)
    })
  }

  function handleToggle(entryId: string, completed: boolean) {
    startTransition(async () => {
      await updateProgressEntry({ id: entryId, completed })
    })
  }

  function handleDelete(entryId: string) {
    startTransition(async () => {
      await deleteProgressEntry(entryId)
    })
  }

  const formContent = (
    prefix: "add" | "edit",
    values: { title: string; description: string; dueDate: Date | undefined },
    setters: {
      setTitle: (v: string) => void
      setDescription: (v: string) => void
      setDueDate: (v: Date | undefined) => void
    }
  ) => (
    <div className="flex flex-col gap-4 px-1">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-entry-title`}>Tittel *</Label>
        <Input
          id={`${prefix}-entry-title`}
          placeholder="F.eks. Innhente tilbud"
          value={values.title}
          onChange={(e) => setters.setTitle(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-entry-desc`}>Beskrivelse</Label>
        <Textarea
          id={`${prefix}-entry-desc`}
          placeholder="Beskriv steget..."
          value={values.description}
          onChange={(e) => setters.setDescription(e.target.value)}
          rows={2}
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
                !values.dueDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {values.dueDate
                ? values.dueDate.toLocaleDateString("nb-NO")
                : "Velg dato"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={values.dueDate}
              onSelect={setters.setDueDate}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
          <ListChecks className="h-5 w-5" />
          Fremdriftsplan
        </h2>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Nytt steg
        </Button>
      </div>

      {entries.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-8">
          <ListChecks className="text-muted-foreground mb-3 h-8 w-8" />
          <p className="text-muted-foreground text-sm">
            Ingen steg i fremdriftsplanen ennå
          </p>
          <p className="text-muted-foreground text-xs">
            Legg til steg for å planlegge oppgaven
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                entry.completed && "bg-muted/50 opacity-75"
              )}
            >
              <Checkbox
                checked={entry.completed}
                onCheckedChange={(checked) =>
                  handleToggle(entry.id, checked === true)
                }
                disabled={isPending}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs font-medium">
                    {index + 1}.
                  </span>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      entry.completed && "line-through"
                    )}
                  >
                    {entry.title}
                  </p>
                </div>
                {entry.description && (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {entry.description}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-3 text-xs">
                  {entry.dueDate && (
                    <span className="text-muted-foreground flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      {new Date(entry.dueDate).toLocaleDateString("nb-NO")}
                    </span>
                  )}
                  {entry.completedAt && (
                    <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                      Fullført{" "}
                      {new Date(entry.completedAt).toLocaleDateString("nb-NO")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => openEditForm(entry)}
                  disabled={isPending}
                  aria-label="Rediger steg"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-600 hover:text-red-700 dark:text-red-400"
                  onClick={() => handleDelete(entry.id)}
                  disabled={isPending}
                  aria-label="Slett steg"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add entry sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Nytt steg i fremdriftsplanen</SheetTitle>
          </SheetHeader>
          {formContent(
            "add",
            { title, description, dueDate },
            { setTitle, setDescription, setDueDate }
          )}
          <div className="mt-4 px-1">
            <Button onClick={handleAdd} disabled={isPending} className="w-full">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Legg til steg
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit entry sheet */}
      <Sheet
        open={editingEntry !== null}
        onOpenChange={(open) => !open && setEditingEntry(null)}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Rediger steg</SheetTitle>
          </SheetHeader>
          {formContent(
            "edit",
            {
              title: editTitle,
              description: editDescription,
              dueDate: editDueDate,
            },
            {
              setTitle: setEditTitle,
              setDescription: setEditDescription,
              setDueDate: setEditDueDate,
            }
          )}
          <div className="mt-4 px-1">
            <Button
              onClick={handleUpdate}
              disabled={isPending}
              className="w-full"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lagre endringer
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
