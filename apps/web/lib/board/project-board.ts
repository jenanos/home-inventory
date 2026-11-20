import type {
  Priority,
  ProjectExecution,
  ProjectScale,
  ProjectStatus,
  ProjectType,
} from "@workspace/db"

import {
  DUE_BUCKETS,
  dueBucket,
  dueDateForBucket,
  type DueBucket,
} from "@/lib/board/due-date"
import {
  NONE_KEY,
  PRIORITY_ACCENTS,
  PRIORITY_LABELS,
  compareDueDates,
  dueColumns,
} from "@/lib/board/shopping-board"
import type { BoardColumnDef, BoardGroupingOption } from "@/lib/board/types"
import {
  PROJECT_EXECUTIONS,
  PROJECT_EXECUTION_LABELS,
  PROJECT_SCALES,
  PROJECT_SCALE_LABELS,
  PROJECT_STATUS_CONFIG,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
} from "@/lib/project-labels"

/** How the project board can be grouped, and what a drop changes. */

export const PROJECT_GROUPINGS = [
  { id: "status", label: "Status" },
  { id: "prioritet", label: "Prioritet" },
  { id: "frist", label: "Frist" },
  { id: "type", label: "Type" },
  { id: "omfang", label: "Omfang" },
  { id: "utforelse", label: "Utførelse" },
] as const satisfies readonly BoardGroupingOption[]

export type ProjectGrouping = (typeof PROJECT_GROUPINGS)[number]["id"]

/** The fields the board reads. Dates are ISO strings in client props. */
export interface ProjectBoardFields {
  status: ProjectStatus
  priority: Priority
  dueDate: string | null
  type: ProjectType
  scale: ProjectScale
  execution: ProjectExecution | null
  title: string
}

export type ProjectPatch = {
  status?: ProjectStatus
  priority?: Priority
  dueDate?: Date | null
  type?: ProjectType
  scale?: ProjectScale
  execution?: ProjectExecution | null
}

/** Board order: the work in progress first, finished work last. */
export const PROJECT_STATUSES: ProjectStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
]

const PRIORITIES: Priority[] = ["HIGH", "MEDIUM", "LOW"]

const STATUS_ACCENTS: Record<ProjectStatus, string> = {
  NOT_STARTED: "bg-gray-400",
  IN_PROGRESS: "bg-blue-500",
  ON_HOLD: "bg-orange-500",
  COMPLETED: "bg-green-500",
}

export function projectColumns(
  grouping: ProjectGrouping,
  today: string
): BoardColumnDef[] {
  switch (grouping) {
    case "status":
      return PROJECT_STATUSES.map((status) => ({
        key: status,
        label: PROJECT_STATUS_CONFIG[status].label,
        droppable: true,
        accentClassName: STATUS_ACCENTS[status],
        collapsedByDefault: status === "COMPLETED",
      }))
    case "prioritet":
      return PRIORITIES.map((priority) => ({
        key: priority,
        label: PRIORITY_LABELS[priority],
        droppable: true,
        accentClassName: PRIORITY_ACCENTS[priority],
      }))
    case "frist":
      return dueColumns(today)
    case "type":
      return PROJECT_TYPES.map((type) => ({
        key: type,
        label: PROJECT_TYPE_LABELS[type],
        droppable: true,
      }))
    case "omfang":
      return PROJECT_SCALES.map((scale) => ({
        key: scale,
        label: PROJECT_SCALE_LABELS[scale],
        droppable: true,
      }))
    case "utforelse":
      return [
        ...PROJECT_EXECUTIONS.map((execution) => ({
          key: execution,
          label: PROJECT_EXECUTION_LABELS[execution],
          droppable: true,
        })),
        { key: NONE_KEY, label: "Ikke bestemt", droppable: true },
      ]
  }
}

export function projectColumnKey(
  project: ProjectBoardFields,
  grouping: ProjectGrouping,
  today: string
): string {
  switch (grouping) {
    case "status":
      return project.status
    case "prioritet":
      return project.priority
    case "frist":
      return dueBucket(project.dueDate, today)
    case "type":
      return project.type
    case "omfang":
      return project.scale
    case "utforelse":
      return project.execution ?? NONE_KEY
  }
}

export function projectMovePatch(
  grouping: ProjectGrouping,
  columnKey: string,
  today: string
): ProjectPatch | null {
  const isOneOf = <T extends string>(values: readonly T[]) =>
    (values as readonly string[]).includes(columnKey)

  switch (grouping) {
    case "status":
      return isOneOf(PROJECT_STATUSES)
        ? { status: columnKey as ProjectStatus }
        : null
    case "prioritet":
      return isOneOf(PRIORITIES) ? { priority: columnKey as Priority } : null
    case "frist": {
      if (!isOneOf(DUE_BUCKETS)) return null
      const dueDate = dueDateForBucket(columnKey as DueBucket, today)
      return dueDate === undefined ? null : { dueDate }
    }
    case "type":
      return isOneOf(PROJECT_TYPES) ? { type: columnKey as ProjectType } : null
    case "omfang":
      return isOneOf(PROJECT_SCALES)
        ? { scale: columnKey as ProjectScale }
        : null
    case "utforelse":
      if (columnKey === NONE_KEY) return { execution: null }
      return isOneOf(PROJECT_EXECUTIONS)
        ? { execution: columnKey as ProjectExecution }
        : null
  }
}

export function applyProjectPatch<T extends ProjectBoardFields>(
  project: T,
  patch: ProjectPatch
): T {
  const { dueDate, ...rest } = patch
  return {
    ...project,
    ...rest,
    ...(dueDate !== undefined && {
      dueDate: dueDate ? dueDate.toISOString() : null,
    }),
  }
}

const PRIORITY_ORDER: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

export function compareProjectCards(
  a: ProjectBoardFields,
  b: ProjectBoardFields
) {
  return (
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    compareDueDates(a.dueDate, b.dueDate) ||
    a.title.localeCompare(b.title, "nb")
  )
}
