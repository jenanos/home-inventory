import type {
  Priority,
  ProjectExecution,
  ProjectStatus,
  ProjectType,
} from "@workspace/db"

/**
 * Labels and badge colors for projects, shared by the project pages and the
 * dashboard so they never drift apart. Mirrors the Prisma enums.
 */

type BadgeConfig = { label: string; className: string }

export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, BadgeConfig> = {
  NOT_STARTED: {
    label: "Ikke startet",
    className:
      "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
  IN_PROGRESS: {
    label: "Pågår",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  COMPLETED: {
    label: "Fullført",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  ON_HOLD: {
    label: "På vent",
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
}

export const PRIORITY_CONFIG: Record<Priority, BadgeConfig> = {
  HIGH: {
    label: "Høy",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  MEDIUM: {
    label: "Medium",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  LOW: {
    label: "Lav",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
}

export const PROJECT_TYPES: ProjectType[] = [
  "MAINTENANCE",
  "REPAIR",
  "RENOVATION",
  "IMPROVEMENT",
  "OTHER",
]

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  MAINTENANCE: "Vedlikehold",
  REPAIR: "Reparasjon",
  RENOVATION: "Oppussing",
  IMPROVEMENT: "Forbedring",
  OTHER: "Annet",
}

export const PROJECT_EXECUTIONS: ProjectExecution[] = [
  "SELF",
  "VENDOR",
  "MIXED",
]

export const PROJECT_EXECUTION_LABELS: Record<ProjectExecution, string> = {
  SELF: "Gjør selv",
  VENDOR: "Leverandør",
  MIXED: "Selv + leverandør",
}

/** Value used by selects for "not decided", since a select cannot hold null. */
export const EXECUTION_UNSET = "UNSET"

export function executionFromSelect(value: string): ProjectExecution | null {
  return value === EXECUTION_UNSET ? null : (value as ProjectExecution)
}

/**
 * Vendors matter when someone is hired. A project the household does itself
 * hides the vendor section unless it already has vendors.
 */
export function showsVendors(
  execution: ProjectExecution | null,
  vendorCount: number
) {
  return execution !== "SELF" || vendorCount > 0
}

export const formatNOK = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)
