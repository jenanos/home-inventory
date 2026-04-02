"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
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
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  CalendarIcon,
  Play,
  Pause,
  CheckCircle2,
  RotateCcw,
} from "lucide-react"
import {
  updateMaintenanceTask,
  deleteMaintenanceTask,
} from "@/lib/actions/maintenance-task"
import type { Priority, TaskStatus } from "@workspace/db"

interface TaskActionsProps {
  taskId: string
  currentStatus: TaskStatus
  task: {
    title: string
    description: string | null
    priority: Priority
    status: TaskStatus
    estimatedDuration: string | null
    estimatedPrice: number | null
    dueDate: string | null
  }
}

export function TaskActions({ taskId, currentStatus, task }: TaskActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editOpen, setEditOpen] = useState(false)

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? "")
  const [priority, setPriority] = useState<Priority>(task.priority)
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [estimatedDuration, setEstimatedDuration] = useState(
    task.estimatedDuration ?? ""
  )
  const [estimatedPrice, setEstimatedPrice] = useState(
    task.estimatedPrice?.toString() ?? ""
  )
  const [dueDate, setDueDate] = useState<Date | undefined>(
    task.dueDate ? new Date(task.dueDate) : undefined
  )

  function handleUpdate() {
    if (!title.trim()) return
    startTransition(async () => {
      await updateMaintenanceTask({
        id: taskId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
        estimatedDuration: estimatedDuration.trim() || null,
        estimatedPrice: estimatedPrice ? parseFloat(estimatedPrice) : null,
        dueDate: dueDate || null,
      })
      setEditOpen(false)
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteMaintenanceTask(taskId)
      router.push("/vedlikehold")
    })
  }

  function handleStatusChange(newStatus: TaskStatus) {
    startTransition(async () => {
      await updateMaintenanceTask({ id: taskId, status: newStatus })
    })
  }

  const statusActions: { status: TaskStatus; label: string; icon: React.ReactNode }[] = []
  if (currentStatus !== "IN_PROGRESS") {
    statusActions.push({
      status: "IN_PROGRESS",
      label: "Start",
      icon: <Play className="mr-2 h-4 w-4" />,
    })
  }
  if (currentStatus !== "ON_HOLD" && currentStatus !== "NOT_STARTED") {
    statusActions.push({
      status: "ON_HOLD",
      label: "Sett på vent",
      icon: <Pause className="mr-2 h-4 w-4" />,
    })
  }
  if (currentStatus !== "COMPLETED") {
    statusActions.push({
      status: "COMPLETED",
      label: "Marker som fullført",
      icon: <CheckCircle2 className="mr-2 h-4 w-4" />,
    })
  }
  if (currentStatus === "COMPLETED") {
    statusActions.push({
      status: "NOT_STARTED",
      label: "Gjenåpne",
      icon: <RotateCcw className="mr-2 h-4 w-4" />,
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" disabled={isPending} aria-label="Oppgavehandlinger">
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {statusActions.map((action) => (
            <DropdownMenuItem
              key={action.status}
              onClick={() => handleStatusChange(action.status)}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Rediger
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleDelete}
            className="text-red-600 dark:text-red-400"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Slett oppgave
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Rediger oppgave</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-1">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-title">Tittel</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-description">Beskrivelse</Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Prioritet</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as Priority)}
                >
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
                <Label>Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as TaskStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NOT_STARTED">Ikke startet</SelectItem>
                    <SelectItem value="IN_PROGRESS">Pågår</SelectItem>
                    <SelectItem value="COMPLETED">Fullført</SelectItem>
                    <SelectItem value="ON_HOLD">På vent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-duration">Antatt varighet</Label>
                <Input
                  id="edit-duration"
                  value={estimatedDuration}
                  onChange={(e) => setEstimatedDuration(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-price">Estimert pris (NOK)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  value={estimatedPrice}
                  onChange={(e) => setEstimatedPrice(e.target.value)}
                />
              </div>
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

            <Button onClick={handleUpdate} disabled={isPending} className="mt-2">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lagre endringer
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
