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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { updateProject, deleteProject } from "@/lib/actions/project"
import { useMediaQuery } from "@/hooks/use-media-query"
import type {
  Priority,
  ProjectExecution,
  ProjectScale,
  ProjectStatus,
  ProjectType,
} from "@workspace/db"
import { ProjectScalePicker } from "@/components/project-scale-picker"
import {
  EXECUTION_UNSET,
  PROJECT_EXECUTIONS,
  PROJECT_EXECUTION_LABELS,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  executionFromSelect,
} from "@/lib/project-labels"

interface ProjectActionsProps {
  projectId: string
  currentStatus: ProjectStatus
  /** Shown in the delete confirmation: linked lists are kept. */
  shoppingListCount: number
  project: {
    title: string
    description: string | null
    type: ProjectType
    scale: ProjectScale
    execution: ProjectExecution | null
    priority: Priority
    status: ProjectStatus
    estimatedDuration: string | null
    estimatedPrice: number | null
    dueDate: string | null
  }
}

export function ProjectActions({
  projectId,
  currentStatus,
  shoppingListCount,
  project: task,
}: ProjectActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? "")
  const [type, setType] = useState<ProjectType>(task.type)
  const [scale, setScale] = useState<ProjectScale>(task.scale)
  const [execution, setExecution] = useState<string>(
    task.execution ?? EXECUTION_UNSET
  )
  const [priority, setPriority] = useState<Priority>(task.priority)
  const [status, setStatus] = useState<ProjectStatus>(task.status)
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
      await updateProject({
        id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        type,
        scale,
        execution: executionFromSelect(execution),
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
      await deleteProject(projectId)
      setDeleteOpen(false)
      router.push("/prosjekter")
    })
  }

  function handleStatusChange(newStatus: ProjectStatus) {
    startTransition(async () => {
      await updateProject({ id: projectId, status: newStatus })
    })
  }

  const statusActions: {
    status: ProjectStatus
    label: string
    icon: React.ReactNode
  }[] = []
  if (currentStatus !== "IN_PROGRESS") {
    statusActions.push({
      status: "IN_PROGRESS",
      label: currentStatus === "ON_HOLD" ? "Gjenoppta" : "Start",
      icon: <Play className="mr-2 h-4 w-4" />,
    })
  }
  if (currentStatus !== "ON_HOLD" && currentStatus !== "COMPLETED") {
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

  const editFormContent = (
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

      <ProjectScalePicker value={scale} onChange={setScale} />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as ProjectType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {PROJECT_TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Hvem gjør jobben?</Label>
          <Select value={execution} onValueChange={setExecution}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EXECUTION_UNSET}>Ikke bestemt</SelectItem>
              {PROJECT_EXECUTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {PROJECT_EXECUTION_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
            onValueChange={(v) => setStatus(v as ProjectStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NOT_STARTED">Ikke startet</SelectItem>
              <SelectItem value="IN_PROGRESS">Pågår</SelectItem>
              <SelectItem value="COMPLETED">Fullført</SelectItem>
              <SelectItem value="ON_HOLD">På vent / inaktiv</SelectItem>
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
        <Label>Frist</Label>
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
              {dueDate ? dueDate.toLocaleDateString("nb-NO") : "Velg dato"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dueDate} onSelect={setDueDate} />
          </PopoverContent>
        </Popover>
      </div>

      <Button onClick={handleUpdate} disabled={isPending} className="mt-2">
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Lagre endringer
      </Button>
    </div>
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            disabled={isPending}
            aria-label="Prosjekthandlinger"
          >
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
            onClick={() => setDeleteOpen(true)}
            className="text-red-600 dark:text-red-400"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Slett prosjekt
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isDesktop ? (
        <Sheet open={editOpen} onOpenChange={setEditOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Rediger prosjekt</SheetTitle>
            </SheetHeader>
            {editFormContent}
          </SheetContent>
        </Sheet>
      ) : (
        <Drawer open={editOpen} onOpenChange={setEditOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Rediger prosjekt</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">{editFormContent}</div>
          </DrawerContent>
        </Drawer>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Slette «{task.title}»?</DialogTitle>
            <DialogDescription>
              Steg og leverandører slettes sammen med prosjektet.
              {shoppingListCount > 0 &&
                ` ${shoppingListCount === 1 ? "Innkjøpslisten" : `De ${shoppingListCount} innkjøpslistene`} beholdes, men kobles fra.`}{" "}
              Vil du heller ta vare på historikken, kan du markere det som
              fullført.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Slett prosjekt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
