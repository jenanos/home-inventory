"use client"

import { useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import type {
  Priority,
  ProjectExecution,
  ProjectScale,
  ProjectStatus,
  ProjectType,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import { Calendar, ListChecks, ShoppingCart } from "lucide-react"

import { KanbanBoard } from "@/components/board/kanban-board"
import { updateProject } from "@/lib/actions/project"
import { dueBucket, osloToday } from "@/lib/board/due-date"
import {
  applyProjectPatch,
  compareProjectCards,
  projectColumnKey,
  projectColumns,
  projectMovePatch,
  type ProjectGrouping,
} from "@/lib/board/project-board"
import {
  PRIORITY_CONFIG,
  PROJECT_EXECUTION_LABELS,
  PROJECT_SCALE_LABEL_ONE,
  PROJECT_STATUS_CONFIG,
  PROJECT_TYPE_LABELS,
  formatNOK,
} from "@/lib/project-labels"

/** What a project card on the board shows. Plain values only. */
export interface ProjectBoardItem {
  id: string
  title: string
  status: ProjectStatus
  priority: Priority
  type: ProjectType
  scale: ProjectScale
  execution: ProjectExecution | null
  dueDate: string | null
  estimatedPrice: number | null
  completedSteps: number
  totalSteps: number
  purchasedCount: number
  purchaseCount: number
}

const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Oslo",
  }).format(new Date(value))

export function ProjectBoard({
  projects,
  grouping,
}: {
  projects: ProjectBoardItem[]
  grouping: ProjectGrouping
}) {
  const router = useRouter()
  const today = useMemo(() => osloToday(), [])
  const columns = useMemo(
    () => projectColumns(grouping, today),
    [grouping, today]
  )

  const getColumnKey = useCallback(
    (project: ProjectBoardItem) => projectColumnKey(project, grouping, today),
    [grouping, today]
  )

  const applyMove = useCallback(
    (project: ProjectBoardItem, columnKey: string) => {
      const patch = projectMovePatch(grouping, columnKey, today)
      return patch ? applyProjectPatch(project, patch) : null
    },
    [grouping, today]
  )

  const onMove = useCallback(
    async (project: ProjectBoardItem, columnKey: string) => {
      const patch = projectMovePatch(grouping, columnKey, today)
      if (patch) await updateProject({ id: project.id, ...patch })
    },
    [grouping, today]
  )

  return (
    <KanbanBoard
      items={projects}
      columns={columns}
      getId={(project) => project.id}
      getLabel={(project) => project.title}
      getColumnKey={getColumnKey}
      isDone={
        grouping === "status"
          ? undefined
          : (project) => project.status === "COMPLETED"
      }
      doneLabel="Fullført"
      compare={compareProjectCards}
      applyMove={applyMove}
      onMove={onMove}
      onOpen={(project) => router.push(`/prosjekter/${project.id}`)}
      emptyLabel="Ingen prosjekter her"
      renderColumnSummary={(items) => {
        const total = items.reduce(
          (sum, project) =>
            project.status === "COMPLETED"
              ? sum
              : sum + (project.estimatedPrice ?? 0),
          0
        )
        return total > 0 ? formatNOK(total) : null
      }}
      renderCard={(project) => (
        <ProjectBoardCard project={project} grouping={grouping} today={today} />
      )}
    />
  )
}

function ProjectBoardCard({
  project,
  grouping,
  today,
}: {
  project: ProjectBoardItem
  grouping: ProjectGrouping
  today: string
}) {
  const isDone = project.status === "COMPLETED"
  const overdue =
    !isDone &&
    project.dueDate &&
    dueBucket(project.dueDate, today) === "OVERDUE"
  const badge = "h-5 px-1.5 text-[11px]"
  const status = PROJECT_STATUS_CONFIG[project.status]
  const priority = PRIORITY_CONFIG[project.priority]

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-2.5 text-left shadow-xs transition-colors hover:border-foreground/20",
        isDone && "opacity-60"
      )}
    >
      <p
        className={cn(
          "text-sm leading-snug font-medium",
          isDone && "text-muted-foreground line-through"
        )}
      >
        {project.title}
      </p>

      <div className="flex flex-wrap items-center gap-1">
        {grouping !== "status" && (
          <Badge variant="secondary" className={cn(badge, status.className)}>
            {status.label}
          </Badge>
        )}
        {grouping !== "prioritet" && (
          <Badge variant="outline" className={cn(badge, priority.className)}>
            {priority.label}
          </Badge>
        )}
        {grouping !== "type" && (
          <Badge variant="outline" className={badge}>
            {PROJECT_TYPE_LABELS[project.type]}
          </Badge>
        )}
        {grouping !== "omfang" && project.scale === "MAJOR" && (
          <Badge variant="outline" className={cn(badge, "border-primary/40")}>
            {PROJECT_SCALE_LABEL_ONE.MAJOR}
          </Badge>
        )}
        {grouping !== "utforelse" && project.execution && (
          <Badge variant="outline" className={badge}>
            {PROJECT_EXECUTION_LABELS[project.execution]}
          </Badge>
        )}
      </div>

      {(project.dueDate ||
        project.totalSteps > 0 ||
        project.purchaseCount > 0 ||
        project.estimatedPrice != null) && (
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          {project.dueDate && (
            <span
              className={cn(
                "flex shrink-0 items-center gap-1",
                overdue && "font-medium text-red-600 dark:text-red-400"
              )}
            >
              <Calendar className="size-3" />
              {formatShortDate(project.dueDate)}
            </span>
          )}
          {project.totalSteps > 0 && (
            <span
              className="flex shrink-0 items-center gap-1 tabular-nums"
              title="Steg fullført"
            >
              <ListChecks className="size-3" />
              {project.completedSteps}/{project.totalSteps}
            </span>
          )}
          {project.purchaseCount > 0 && (
            <span
              className="flex shrink-0 items-center gap-1 tabular-nums"
              title="Innkjøp gjort"
            >
              <ShoppingCart className="size-3" />
              {project.purchasedCount}/{project.purchaseCount}
            </span>
          )}
          {project.estimatedPrice != null && (
            <span className="ml-auto shrink-0 font-medium text-foreground tabular-nums">
              {formatNOK(project.estimatedPrice)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
