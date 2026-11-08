import Link from "next/link"
import type {
  Priority,
  ProjectExecution,
  ProjectStatus,
  ProjectType,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { cn } from "@workspace/ui/lib/utils"
import { Clock, ShoppingCart } from "lucide-react"

import { summarizeShoppingList } from "@/lib/project-purchases"
import {
  PRIORITY_CONFIG,
  PROJECT_EXECUTION_LABELS,
  PROJECT_STATUS_CONFIG,
  PROJECT_TYPE_LABELS,
  formatNOK,
} from "@/lib/project-labels"

type Price = { toString(): string } | null

export type ProjectCardData = {
  id: string
  title: string
  description: string | null
  type: ProjectType
  execution: ProjectExecution | null
  status: ProjectStatus
  priority: Priority
  estimatedDuration: string | null
  estimatedPrice: Price
  dueDate: Date | null
  vendors: Array<{ name: string; isSelected: boolean }>
  steps: Array<{ completed: boolean }>
  shoppingLists: Array<{
    items: Array<{
      status: string
      estimatedPrice: Price
      alternatives: Array<{ price: Price }>
    }>
  }>
}

export function ProjectCard({
  project,
  className,
}: {
  project: ProjectCardData
  className?: string
}) {
  const totalSteps = project.steps.length
  const completedSteps = project.steps.filter((step) => step.completed).length
  const progressPercent =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
  const selectedVendor = project.vendors.find((vendor) => vendor.isSelected)
  const purchases = summarizeShoppingList(
    project.shoppingLists.flatMap((list) => list.items)
  )
  const status = PROJECT_STATUS_CONFIG[project.status]
  const priority = PRIORITY_CONFIG[project.priority]

  return (
    <Link href={`/prosjekter/${project.id}`}>
      <Card
        className={cn("h-full transition-colors hover:bg-muted/50", className)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight">
              {project.title}
            </CardTitle>
            <Badge variant="secondary" className={status.className}>
              {status.label}
            </Badge>
          </div>
          {project.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{PROJECT_TYPE_LABELS[project.type]}</Badge>
            <Badge variant="outline" className={priority.className}>
              {priority.label}
            </Badge>
            {project.execution && (
              <Badge variant="outline">
                {PROJECT_EXECUTION_LABELS[project.execution]}
              </Badge>
            )}
            {project.estimatedDuration && (
              <Badge variant="outline">
                <Clock className="mr-1 h-3 w-3" />
                {project.estimatedDuration}
              </Badge>
            )}
            {project.dueDate && (
              <Badge variant="outline">
                {new Date(project.dueDate).toLocaleDateString("nb-NO")}
              </Badge>
            )}
          </div>

          {project.estimatedPrice != null && (
            <p className="text-sm font-medium tabular-nums">
              {formatNOK(Number(project.estimatedPrice))}
            </p>
          )}

          {selectedVendor && (
            <p className="text-xs text-muted-foreground">
              Valgt leverandør:{" "}
              <span className="font-medium text-foreground">
                {selectedVendor.name}
              </span>
            </p>
          )}

          {purchases.itemCount > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>
                <span className="font-medium text-foreground tabular-nums">
                  {purchases.purchasedCount}/{purchases.itemCount}
                </span>{" "}
                kjøpt
                {purchases.estimatedTotal > 0 && (
                  <> · {formatNOK(purchases.estimatedTotal)}</>
                )}
              </span>
            </p>
          )}

          {totalSteps > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Steg</span>
                <span className="font-medium">
                  {completedSteps}/{totalSteps}
                </span>
              </div>
              <Progress value={progressPercent} />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
