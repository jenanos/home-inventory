import Link from "next/link"
import type { ProjectScale, ProjectStatus, ProjectType } from "@workspace/db"
import { Card } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { Hammer } from "lucide-react"

import { ProjectCard } from "@/components/project-card"
import { ProjectStatsSummary } from "@/components/project-stats-summary"
import { calculateProjectStats, isActiveProject } from "@/lib/dashboard-stats"
import {
  PROJECT_SCALES,
  PROJECT_SCALE_LABELS,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
} from "@/lib/project-labels"
import { getProjects } from "@/lib/queries/projects"
import { requireHousehold } from "@/lib/session"
import { CreateProjectDialog } from "./create-project-dialog"

const VIEWS = {
  aktive: "Aktive",
  "pa-vent": "På vent",
  fullforte: "Fullførte",
  alle: "Alle",
} as const

type View = keyof typeof VIEWS

const VIEW_MATCHES: Record<View, (status: ProjectStatus) => boolean> = {
  aktive: (status) => isActiveProject({ status }),
  "pa-vent": (status) => status === "ON_HOLD",
  fullforte: (status) => status === "COMPLETED",
  alle: () => true,
}

const EMPTY_TEXT: Record<View, string> = {
  aktive: "Ingen aktive prosjekter her. Alt er gjort!",
  "pa-vent":
    "Ingenting på vent. Sett et prosjekt på vent når du ikke jobber med det, men vil ta vare på det til senere.",
  fullforte: "Ingen fullførte prosjekter her ennå.",
  alle: "Ingen prosjekter her.",
}

/** URL values for the scale filter. */
const SCALE_PARAMS: Record<ProjectScale, string> = {
  ROUTINE: "lopende",
  MAJOR: "storre",
}

function scaleFromParam(value: string | undefined): ProjectScale | undefined {
  return PROJECT_SCALES.find((scale) => SCALE_PARAMS[scale] === value)
}

function isView(value: string | undefined): value is View {
  return !!value && value in VIEWS
}

function isProjectType(value: string | undefined): value is ProjectType {
  return !!value && (PROJECT_TYPES as string[]).includes(value)
}

interface ProjectsPageProps {
  searchParams: Promise<{ vis?: string; type?: string; omfang?: string }>
}

export default async function ProjectsPage({
  searchParams,
}: ProjectsPageProps) {
  const params = await searchParams
  const view: View = isView(params.vis) ? params.vis : "aktive"
  const type = isProjectType(params.type) ? params.type : undefined
  const scale = scaleFromParam(params.omfang)

  const { context } = await requireHousehold()
  const projects = await getProjects(context)

  const filtered = projects.filter(
    (project) =>
      (!type || project.type === type) && (!scale || project.scale === scale)
  )
  const visible = filtered.filter((project) =>
    VIEW_MATCHES[view](project.status)
  )
  const stats = calculateProjectStats(filtered)
  const onHoldCount = filtered.filter(
    (project) => project.status === "ON_HOLD"
  ).length

  function href(next: {
    vis?: View
    type?: ProjectType | null
    omfang?: ProjectScale | null
  }) {
    const search = new URLSearchParams()
    const nextView = next.vis ?? view
    const nextType = next.type === undefined ? type : next.type
    const nextScale = next.omfang === undefined ? scale : next.omfang
    if (nextScale) search.set("omfang", SCALE_PARAMS[nextScale])
    if (nextView !== "aktive") search.set("vis", nextView)
    if (nextType) search.set("type", nextType)
    const query = search.toString()
    return query ? `/prosjekter?${query}` : "/prosjekter"
  }

  const typesInUse = PROJECT_TYPES.filter((value) =>
    projects.some((project) => project.type === value)
  )

  // Without a scale filter both kinds share the page, each under its own
  // heading, so routine upkeep never drowns in (or hides) the big jobs.
  const groups = scale
    ? [{ scale, projects: visible }]
    : PROJECT_SCALES.map((value) => ({
        scale: value,
        projects: visible.filter((project) => project.scale === value),
      })).filter((group) => group.projects.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Prosjekter
          </h1>
          <p className="text-sm text-muted-foreground">
            Løpende vedlikehold og større prosjekter i hjemmet – enten du gjør
            det selv eller leier inn hjelp
          </p>
        </div>
        <CreateProjectDialog defaultScale={scale ?? "ROUTINE"} />
      </div>

      {projects.length > 0 && (
        <FilterRow label="Omfang">
          <FilterChip href={href({ omfang: null })} active={!scale}>
            Alt
          </FilterChip>
          {PROJECT_SCALES.map((value) => (
            <FilterChip
              key={value}
              href={href({ omfang: value })}
              active={scale === value}
            >
              {PROJECT_SCALE_LABELS[value]}
            </FilterChip>
          ))}
        </FilterRow>
      )}

      {filtered.length > 0 && (
        <ProjectStatsSummary
          stats={stats}
          scaleHref={scale ? undefined : (value) => href({ omfang: value })}
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
                {value === "pa-vent" && onHoldCount > 0 && (
                  <span className="ml-1 tabular-nums opacity-70">
                    {onHoldCount}
                  </span>
                )}
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
          <p className="max-w-md text-sm text-muted-foreground">
            {EMPTY_TEXT[view]}
          </p>
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.scale} className="flex flex-col gap-3">
            {!scale && (
              <h2 className="flex items-baseline gap-2 font-heading text-lg tracking-tight">
                {PROJECT_SCALE_LABELS[group.scale]}
                <span className="text-sm font-normal text-muted-foreground tabular-nums">
                  {group.projects.length}
                </span>
              </h2>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </section>
        ))
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
      <span className="w-14 shrink-0 text-xs text-muted-foreground">
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
