import Link from "next/link"
import { notFound } from "next/navigation"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { Separator } from "@workspace/ui/components/separator"
import {
  ArrowLeft,
  CalendarIcon,
  CheckCircle2,
  Clock,
  Flag,
  Tag,
  UserRound,
  Wallet,
} from "lucide-react"

import {
  PRIORITY_CONFIG,
  PROJECT_EXECUTION_LABELS,
  PROJECT_STATUS_CONFIG,
  PROJECT_SCALE_LABEL_ONE,
  PROJECT_TYPE_LABELS,
  formatNOK,
  showsVendors,
} from "@/lib/project-labels"
import { AttachmentGallery } from "@/components/attachments/attachment-gallery"
import { summarizeShoppingList } from "@/lib/project-purchases"
import { getGalleryAttachments } from "@/lib/queries/attachments"
import { getProject, getUnlinkedShoppingLists } from "@/lib/queries/projects"
import { requireHousehold } from "@/lib/session"
import { ProjectActions } from "./project-actions"
import { PurchasesSection } from "./purchases-section"
import { StepsSection } from "./steps-section"
import { VendorSection } from "./vendor-section"

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params
  const { context } = await requireHousehold()
  const [project, unlinkedLists, attachments] = await Promise.all([
    getProject(context, id),
    getUnlinkedShoppingLists(context),
    getGalleryAttachments(context, { type: "project", id }),
  ])

  if (!project) {
    notFound()
  }

  const totalSteps = project.steps.length
  const completedSteps = project.steps.filter((step) => step.completed).length
  const progressPercent =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  const vendors = project.vendors.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    description: vendor.description,
    phone: vendor.phone,
    email: vendor.email,
    website: vendor.website,
    estimatedPrice: vendor.estimatedPrice
      ? Number(vendor.estimatedPrice)
      : null,
    notes: vendor.notes,
    isSelected: vendor.isSelected,
    projectId: vendor.projectId,
  }))

  const steps = project.steps.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    dueDate: step.dueDate ? step.dueDate.toISOString() : null,
    completed: step.completed,
    completedAt: step.completedAt ? step.completedAt.toISOString() : null,
    sortOrder: step.sortOrder,
    projectId: step.projectId,
  }))

  const shoppingLists = project.shoppingLists.map((list) => ({
    id: list.id,
    name: list.name,
    isPrivate: list.isPrivate,
    summary: summarizeShoppingList(list.items),
  }))

  const status = PROJECT_STATUS_CONFIG[project.status]
  const priority = PRIORITY_CONFIG[project.priority]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
        <Link
          href="/prosjekter"
          className="mt-1 shrink-0 text-muted-foreground transition-colors hover:text-foreground sm:mt-0"
          aria-label="Tilbake til prosjekter"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
              {project.title}
            </h1>
            <Badge variant="secondary" className={status.className}>
              {status.label}
            </Badge>
          </div>
          {project.description && (
            <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>
        <ProjectActions
          projectId={project.id}
          currentStatus={project.status}
          shoppingListCount={shoppingLists.length}
          project={{
            title: project.title,
            description: project.description,
            type: project.type,
            scale: project.scale,
            execution: project.execution,
            priority: project.priority,
            status: project.status,
            estimatedDuration: project.estimatedDuration,
            estimatedPrice: project.estimatedPrice
              ? Number(project.estimatedPrice)
              : null,
            dueDate: project.dueDate ? project.dueDate.toISOString() : null,
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <InfoCard icon={Tag} label="Type">
          <p className="text-sm font-medium">
            {PROJECT_TYPE_LABELS[project.type]}
          </p>
          <p className="text-xs text-muted-foreground">
            {PROJECT_SCALE_LABEL_ONE[project.scale]}
          </p>
        </InfoCard>

        <InfoCard icon={UserRound} label="Hvem gjør jobben">
          <p className="text-sm font-medium">
            {project.execution
              ? PROJECT_EXECUTION_LABELS[project.execution]
              : "Ikke bestemt"}
          </p>
        </InfoCard>

        <InfoCard icon={Flag} label="Prioritet">
          <Badge variant="secondary" className={priority.className}>
            {priority.label}
          </Badge>
        </InfoCard>

        {project.estimatedDuration && (
          <InfoCard icon={Clock} label="Antatt varighet">
            <p className="text-sm font-medium">{project.estimatedDuration}</p>
          </InfoCard>
        )}

        {project.estimatedPrice != null && (
          <InfoCard icon={Wallet} label="Estimert pris">
            <p className="text-sm font-medium tabular-nums">
              {formatNOK(Number(project.estimatedPrice))}
            </p>
          </InfoCard>
        )}

        {project.dueDate && (
          <InfoCard icon={CalendarIcon} label="Frist">
            <p className="text-sm font-medium">
              {new Date(project.dueDate).toLocaleDateString("nb-NO", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </InfoCard>
        )}
      </div>

      {totalSteps > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4" />
                Fremdrift
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {completedSteps}/{totalSteps} ({progressPercent}%)
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={progressPercent} />
          </CardContent>
        </Card>
      )}

      <Separator />

      <StepsSection projectId={project.id} entries={steps} />

      <Separator />

      <PurchasesSection
        projectId={project.id}
        projectTitle={project.title}
        lists={shoppingLists}
        unlinkedLists={unlinkedLists}
      />

      {showsVendors(project.execution, vendors.length) && (
        <>
          <Separator />
          <VendorSection projectId={project.id} vendors={vendors} />
        </>
      )}

      <Separator />

      <AttachmentGallery
        targetType="project"
        targetId={project.id}
        attachments={attachments}
        title="Bilder og dokumenter"
      />
    </div>
  )
}

function InfoCard({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {children}
        </div>
      </CardContent>
    </Card>
  )
}
