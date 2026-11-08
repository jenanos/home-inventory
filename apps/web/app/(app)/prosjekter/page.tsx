import Link from "next/link"
import type { ProjectType } from "@workspace/db"
import { Card } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { Hammer } from "lucide-react"

import { ProjectCard } from "@/components/project-card"
import { ProjectStatsSummary } from "@/components/project-stats-summary"
import { calculateProjectStats } from "@/lib/dashboard-stats"
import { PROJECT_TYPES, PROJECT_TYPE_LABELS } from "@/lib/project-labels"
import { getProjects } from "@/lib/queries/projects"
import { requireHousehold } from "@/lib/session"
import { CreateProjectDialog } from "./create-project-dialog"

const VIEWS = {
  aktive: "Aktive",
  fullforte: "Fullførte",
  alle: "Alle",
} as const

type View = keyof typeof VIEWS

function isView(value: string | undefined): value is View {
  return !!value && value in VIEWS
}

function isProjectType(value: string | undefined): value is ProjectType {
  return !!value && (PROJECT_TYPES as string[]).includes(value)
}

interface ProjectsPageProps {
  searchParams: Promise<{ vis?: string; type?: string }>
}

export default async function ProjectsPage({
  searchParams,
}: ProjectsPageProps) {
  const params = await searchParams
  const view: View = isView(params.vis) ? params.vis : "aktive"
  const type = isProjectType(params.type) ? params.type : undefined

  const { context } = await requireHousehold()
  const projects = await getProjects(context)

  const ofType = type
    ? projects.filter((project) => project.type === type)
    : projects
  const visible = ofType.filter((project) =>
    view === "alle"
      ? true
      : view === "fullforte"
        ? project.status === "COMPLETED"
        : project.status !== "COMPLETED"
  )
  const stats = calculateProjectStats(ofType)

  function href(next: { vis?: View; type?: ProjectType | null }) {
    const search = new URLSearchParams()
    const nextView = next.vis ?? view
    const nextType = next.type === undefined ? type : next.type
    if (nextView !== "aktive") search.set("vis", nextView)
    if (nextType) search.set("type", nextType)
    const query = search.toString()
    return query ? `/prosjekter?${query}` : "/prosjekter"
  }

  const typesInUse = PROJECT_TYPES.filter((value) =>
    projects.some((project) => project.type === value)
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Prosjekter
          </h1>
          <p className="text-sm text-muted-foreground">
            Vedlikehold, oppussing og andre prosjekter i hjemmet – enten du gjør
            det selv eller leier inn hjelp
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {ofType.length > 0 && (
        <ProjectStatsSummary
          totalEstimatedCost={stats.totalEstimatedCost}
          totalProjects={stats.totalProjects}
          notStartedCount={stats.notStartedCount}
          inProgressCount={stats.inProgressCount}
          completedCount={stats.completedCount}
        />
      )}

      {projects.length > 0 && (
        <div className="flex flex-col gap-3">
          <FilterRow label="Vis">
            {(Object.keys(VIEWS) as View[]).map((value) => (
              <FilterChip
                key={value}
                href={href({ vis: value })}
                active={view === value}
              >
                {VIEWS[value]}
              </FilterChip>
            ))}
          </FilterRow>
          {typesInUse.length > 1 && (
            <FilterRow label="Type">
              <FilterChip href={href({ type: null })} active={!type}>
                Alle typer
              </FilterChip>
              {typesInUse.map((value) => (
                <FilterChip
                  key={value}
                  href={href({ type: value })}
                  active={type === value}
                >
                  {PROJECT_TYPE_LABELS[value]}
                </FilterChip>
              ))}
            </FilterRow>
          )}
        </div>
      )}

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <Hammer className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="font-heading text-lg font-medium">
            Ingen prosjekter ennå
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Legg til noe du vil få gjort – store eller små ting
          </p>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {view === "fullforte"
              ? "Ingen fullførte prosjekter her ennå."
              : view === "aktive"
                ? "Ingen aktive prosjekter. Alt er gjort!"
                : "Ingen prosjekter av denne typen."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      <span className="w-10 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="flex gap-1.5">{children}</div>
    </div>
  )
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </Link>
  )
}
