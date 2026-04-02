import { notFound } from "next/navigation"
import { requireHousehold } from "@/lib/session"
import { getMaintenanceTask } from "@/lib/queries/maintenance"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { Separator } from "@workspace/ui/components/separator"
import {
  ArrowLeft,
  Clock,
  CalendarIcon,
  Wrench,
  CheckCircle2,
} from "lucide-react"
import Link from "next/link"
import { TaskActions } from "./task-actions"
import { VendorSection } from "./vendor-section"
import { ProgressSection } from "./progress-section"

const priorityConfig = {
  HIGH: { label: "Høy", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  MEDIUM: { label: "Medium", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  LOW: { label: "Lav", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
}

const statusConfig = {
  NOT_STARTED: { label: "Ikke startet", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" },
  IN_PROGRESS: { label: "Pågår", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  COMPLETED: { label: "Fullført", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  ON_HOLD: { label: "På vent", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

interface TaskPageProps {
  params: Promise<{ id: string }>
}

export default async function TaskPage({ params }: TaskPageProps) {
  const { id } = await params
  const { membership } = await requireHousehold()
  const task = await getMaintenanceTask(id, membership.householdId)

  if (!task) {
    notFound()
  }

  const totalEntries = task.progressEntries.length
  const completedEntries = task.progressEntries.filter((e) => e.completed).length
  const progressPercent =
    totalEntries > 0 ? Math.round((completedEntries / totalEntries) * 100) : 0

  const vendors = task.vendors.map((v) => ({
    id: v.id,
    name: v.name,
    description: v.description,
    phone: v.phone,
    email: v.email,
    website: v.website,
    estimatedPrice: v.estimatedPrice ? Number(v.estimatedPrice) : null,
    notes: v.notes,
    isSelected: v.isSelected,
    taskId: v.taskId,
  }))

  const progressEntries = task.progressEntries.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    dueDate: e.dueDate ? e.dueDate.toISOString() : null,
    completed: e.completed,
    completedAt: e.completedAt ? e.completedAt.toISOString() : null,
    sortOrder: e.sortOrder,
    taskId: e.taskId,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link
          href="/vedlikehold"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              {task.title}
            </h1>
            <Badge
              variant="secondary"
              className={statusConfig[task.status].className}
            >
              {statusConfig[task.status].label}
            </Badge>
          </div>
          {task.description && (
            <p className="text-muted-foreground mt-1 text-sm">
              {task.description}
            </p>
          )}
        </div>
        <TaskActions
          taskId={task.id}
          currentStatus={task.status}
          task={{
            title: task.title,
            description: task.description,
            priority: task.priority,
            status: task.status,
            estimatedDuration: task.estimatedDuration,
            estimatedPrice: task.estimatedPrice ? Number(task.estimatedPrice) : null,
            dueDate: task.dueDate ? task.dueDate.toISOString() : null,
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="bg-primary/10 rounded-lg p-2">
              <Wrench className="text-primary h-4 w-4" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Prioritet</p>
              <Badge variant="secondary" className={priorityConfig[task.priority].className}>
                {priorityConfig[task.priority].label}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {task.estimatedDuration && (
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="bg-primary/10 rounded-lg p-2">
                <Clock className="text-primary h-4 w-4" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Antatt varighet</p>
                <p className="text-sm font-medium">{task.estimatedDuration}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {task.estimatedPrice != null && (
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="bg-primary/10 rounded-lg p-2">
                <Wrench className="text-primary h-4 w-4" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Estimert pris</p>
                <p className="text-sm font-medium tabular-nums">
                  {formatCurrency(Number(task.estimatedPrice))}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {task.dueDate && (
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="bg-primary/10 rounded-lg p-2">
                <CalendarIcon className="text-primary h-4 w-4" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Forfallsdato</p>
                <p className="text-sm font-medium">
                  {new Date(task.dueDate).toLocaleDateString("nb-NO", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {totalEntries > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4" />
                Fremdrift
              </CardTitle>
              <span className="text-muted-foreground text-sm">
                {completedEntries}/{totalEntries} ({progressPercent}%)
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={progressPercent} />
          </CardContent>
        </Card>
      )}

      <Separator />

      <ProgressSection taskId={task.id} entries={progressEntries} />

      <Separator />

      <VendorSection taskId={task.id} vendors={vendors} />
    </div>
  )
}
